package main

import (
	"errors"
	"fmt"
	"log"

	"bigphant/internal/ai"
	"bigphant/internal/dbcontext"
	"bigphant/internal/sqlbuilder"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// --- AI Assistant config ---------------------------------------------------

// AIConfig is the frontend-facing view of the AI settings. The API key itself is
// never projected — only whether one is set.
type AIConfig struct {
	HasKey bool   `json:"has_key"`
	Model  string `json:"model"`
}

// AIStatus reports AI enablement for the active connection and database.
type AIStatus struct {
	HasKey     bool   `json:"has_key"`
	Enabled    bool   `json:"enabled"`
	Mode       string `json:"mode"` // "db_user" | "app_layer" | ""
	HasContext bool   `json:"has_context"`
}

// AIEnableResult is returned after opting in to the AI Assistant.
type AIEnableResult struct {
	Mode             string `json:"mode"` // "db_user" | "app_layer"
	ContextGenerated bool   `json:"context_generated"`
}

// AIChatMessage is one visible turn of the conversation (user or assistant).
type AIChatMessage struct {
	Role    string `json:"role"` // "user" | "assistant"
	Content string `json:"content"`
}

// AIChatRequest carries the full visible history (including the latest user
// message) plus the database the question is about.
type AIChatRequest struct {
	Database string          `json:"database"`
	Messages []AIChatMessage `json:"messages"`
}

// AIChatResponse is the assistant's final natural-language answer.
type AIChatResponse struct {
	Answer string `json:"answer"`
}

// GetAIConfig returns the AI settings without exposing the key.
func (a *App) GetAIConfig() (AIConfig, error) {
	if a.aiConfig == nil {
		return AIConfig{}, nil
	}
	cfg, err := a.aiConfig.Load()
	if err != nil {
		return AIConfig{}, err
	}
	return AIConfig{HasKey: cfg.APIKey != "", Model: cfg.Model}, nil
}

// SetAIConfig persists the OpenRouter key and model. A blank apiKey preserves the
// stored key (the frontend never holds it to resend).
func (a *App) SetAIConfig(apiKey, model string) error {
	if a.aiConfig == nil {
		return errors.New("AI config store unavailable")
	}
	return a.aiConfig.Save(ai.Config{APIKey: apiKey, Model: model})
}

// ListAIModels fetches the available models from OpenRouter using the stored key.
func (a *App) ListAIModels() ([]ai.Model, error) {
	if a.aiConfig == nil {
		return nil, errors.New("AI config store unavailable")
	}
	cfg, err := a.aiConfig.Load()
	if err != nil {
		return nil, err
	}
	if cfg.APIKey == "" {
		return nil, errors.New("add your OpenRouter API key first")
	}
	return ai.NewClient(cfg.APIKey).ListModels(a.ctx)
}

// --- Database context markdown ---------------------------------------------

// GenerateDBContext introspects the database into a markdown context file,
// saves it, and returns it.
func (a *App) GenerateDBContext(database string) (string, error) {
	if err := a.requireConn(); err != nil {
		return "", err
	}
	md, err := dbcontext.Generate(a.conn, database)
	if err != nil {
		return "", err
	}
	if a.ctxStore != nil {
		if err := a.ctxStore.Save(a.activeConnID, database, md); err != nil {
			return "", err
		}
	}
	return md, nil
}

// GetDBContext returns the saved context markdown for the active connection's
// database, or "" if none has been generated.
func (a *App) GetDBContext(database string) (string, error) {
	if a.ctxStore == nil || a.activeConnID == "" {
		return "", nil
	}
	return a.ctxStore.Get(a.activeConnID, database)
}

// SaveDBContext persists user edits to the context markdown.
func (a *App) SaveDBContext(database, markdown string) error {
	if a.ctxStore == nil {
		return errors.New("context store unavailable")
	}
	if a.activeConnID == "" {
		return errors.New("no active connection")
	}
	return a.ctxStore.Save(a.activeConnID, database, markdown)
}

// --- Enablement / status ---------------------------------------------------

// EnableAIAssistant opts the active connection in to the AI Assistant. It
// provisions a SELECT-only database user (falling back to app-layer read-only
// enforcement if the connection lacks privilege) and generates the initial
// per-database context file.
func (a *App) EnableAIAssistant(database string) (AIEnableResult, error) {
	if err := a.requireConn(); err != nil {
		return AIEnableResult{}, err
	}
	if err := a.requireLicense(); err != nil {
		return AIEnableResult{}, err
	}
	if a.store == nil {
		return AIEnableResult{}, errors.New("connection store unavailable")
	}

	// Provisioning statements run on the main (write-capable) connection with the
	// destructive check and read-only guard bypassed — these are known, safe
	// account-management statements.
	exec := func(sql string) error {
		_, err := a.conn.ExecuteRaw(sql, "", true, true)
		return err
	}
	username, password, perr := ai.ProvisionROUser(a.conn.Flavor(), database, exec)

	mode := "db_user"
	if perr != nil {
		log.Printf("bigphant: AI read-only user provisioning failed, falling back to app-layer enforcement: %v", perr)
		mode = "app_layer"
	}

	if mode == "db_user" {
		if _, err := a.store.SetAIUser(a.activeConnID, mode, username, password); err != nil {
			return AIEnableResult{}, err
		}
	} else {
		if _, err := a.store.SetAIUser(a.activeConnID, mode, "", ""); err != nil {
			return AIEnableResult{}, err
		}
	}

	// Drop any cached AI pool so the next request reopens with the new mode/creds.
	a.closeAIConn()

	res := AIEnableResult{Mode: mode}
	if md, err := dbcontext.Generate(a.conn, database); err != nil {
		log.Printf("bigphant: AI context generation failed: %v", err)
	} else if a.ctxStore != nil {
		if err := a.ctxStore.Save(a.activeConnID, database, md); err == nil {
			res.ContextGenerated = true
		}
	}
	return res, nil
}

// AIAssistantStatus reports AI enablement for the active connection/database.
func (a *App) AIAssistantStatus(database string) (AIStatus, error) {
	var st AIStatus
	if a.aiConfig != nil {
		if cfg, err := a.aiConfig.Load(); err == nil {
			st.HasKey = cfg.APIKey != ""
		}
	}
	if a.store != nil && a.activeConnID != "" {
		if c, err := a.store.Get(a.activeConnID); err == nil {
			st.Enabled = c.AIEnabled
			st.Mode = c.AIMode
		}
	}
	if a.ctxStore != nil && a.activeConnID != "" {
		st.HasContext = a.ctxStore.Has(a.activeConnID, database)
	}
	return st, nil
}

// --- Chat ------------------------------------------------------------------

// AIChat runs one agentic assistant turn against the active connection's
// read-only AI pool. Each SQL the model runs is emitted as an "ai:tool" event so
// the UI can show progress; "ai:done" is emitted when the turn completes.
func (a *App) AIChat(req AIChatRequest) (AIChatResponse, error) {
	if err := a.requireConn(); err != nil {
		return AIChatResponse{}, err
	}
	if a.aiConfig == nil {
		return AIChatResponse{}, errors.New("AI config store unavailable")
	}
	cfg, err := a.aiConfig.Load()
	if err != nil {
		return AIChatResponse{}, err
	}
	if cfg.APIKey == "" {
		return AIChatResponse{}, errors.New("add your OpenRouter API key in Settings first")
	}
	if cfg.Model == "" {
		return AIChatResponse{}, errors.New("select an AI model in Settings first")
	}
	if err := a.ensureAIConn(req.Database); err != nil {
		return AIChatResponse{}, err
	}

	contextMD, _ := a.GetDBContext(req.Database)

	history := make([]ai.Message, 0, len(req.Messages))
	for _, m := range req.Messages {
		history = append(history, ai.Message{Role: m.Role, Content: m.Content})
	}

	runSQL := func(q string) ([]string, [][]any, error) {
		if !sqlbuilder.IsReadOnly(q) {
			return nil, nil, errors.New("only read-only SELECT statements are allowed")
		}
		res, err := a.aiConn.ExecuteRaw(q, req.Database, false, false)
		if err != nil {
			return nil, nil, err
		}
		if res.Status == "destructive_blocked" || res.Status == "destructive_confirm" {
			return nil, nil, errors.New("statement blocked by the read-only safety policy")
		}
		if res.ResultSet == nil {
			return nil, nil, nil
		}
		cols := make([]string, len(res.ResultSet.Columns))
		for i, c := range res.ResultSet.Columns {
			cols[i] = c.Name
		}
		return cols, res.ResultSet.Rows, nil
	}

	onTool := func(ev ai.ToolEvent) {
		runtime.EventsEmit(a.ctx, "ai:tool", ev)
	}

	assistant := ai.NewAssistant(ai.NewClient(cfg.APIKey), cfg.Model)
	answer, _, err := assistant.Run(a.ctx, history, contextMD, req.Database, runSQL, onTool)
	runtime.EventsEmit(a.ctx, "ai:done", nil)
	if err != nil {
		return AIChatResponse{}, err
	}
	return AIChatResponse{Answer: answer}, nil
}

// ensureAIConn opens (or reuses) the read-only AI pool for the given database.
func (a *App) ensureAIConn(database string) error {
	if a.activeConnID == "" {
		return errors.New("no active connection")
	}
	if a.aiConn != nil && a.aiConnDB == database {
		return nil
	}
	c, err := a.store.Get(a.activeConnID)
	if err != nil {
		return err
	}
	if !c.AIEnabled {
		return errors.New("AI Assistant is not enabled for this connection")
	}

	// Derive a read-only connection. In db_user mode use the dedicated SELECT-only
	// credentials; in app_layer mode reuse the main credentials but force the
	// read-only guard. Either way the AI can only read.
	derived := c
	derived.ReadOnly = true
	if c.AIMode == "db_user" && c.AIUsername != "" {
		derived.Username = c.AIUsername
		derived.Password = c.AIPassword
	}
	if database != "" {
		derived.DefaultDatabase = database
	}

	conn, err := openEngine(derived)
	if err != nil {
		return fmt.Errorf("open AI read-only connection: %w", err)
	}
	a.closeAIConn()
	a.aiConn = conn
	a.aiConnDB = database
	return nil
}

func (a *App) closeAIConn() {
	if a.aiConn != nil {
		a.aiConn.Close()
		a.aiConn = nil
	}
	a.aiConnDB = ""
}
