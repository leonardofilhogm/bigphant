package main

import (
	"context"
	"errors"
	"fmt"
	"log"

	"bigphant/internal/ai"
	"bigphant/internal/apperror"
	"bigphant/internal/connections"
	"bigphant/internal/dbcontext"
	"bigphant/internal/dbtypes"
	"bigphant/internal/engine"
	"bigphant/internal/license"
	"bigphant/internal/mysql"
	"bigphant/internal/postgres"
	"bigphant/internal/settings"
	"bigphant/internal/sqlbuilder"
	"bigphant/internal/sqlite"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails-bound application struct. It owns the connection store and
// this window's single active MySQL connection (docs/prd.md §5).
type App struct {
	ctx           context.Context
	store         *connections.Store
	settingsStore *settings.Store
	settings      settings.AppSettings
	licenseSvc    *license.Service
	conn          engine.Engine
	activeConnID  string

	// AI Assistant (v0.4.0). aiConfig stores the encrypted OpenRouter key; ctxStore
	// holds per-database context markdown. aiConn is a separate read-only pool used
	// exclusively for AI queries, opened lazily and keyed by aiConnDB.
	aiConfig *ai.ConfigStore
	ctxStore *dbcontext.Store
	aiConn   engine.Engine
	aiConnDB string
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	store, err := connections.NewStore()
	if err != nil {
		log.Printf("bigphant: failed to init connection store: %v", err)
		return
	}
	a.store = store

	a.settings = settings.Defaults()
	ss, err := settings.NewStore()
	if err != nil {
		log.Printf("bigphant: failed to init settings store: %v", err)
		return
	}
	a.settingsStore = ss
	if loaded, err := ss.Load(); err != nil {
		log.Printf("bigphant: failed to load settings: %v", err)
	} else {
		a.settings = loaded
	}

	// Rebuild the menu now that settings are loaded so the Appearance radios
	// reflect the persisted theme (the options-time menu was built with
	// defaults, before the store was read).
	runtime.MenuSetApplicationMenu(ctx, a.buildMenu())
	runtime.MenuUpdateApplicationMenu(ctx)

	lic, err := license.NewService()
	if err != nil {
		log.Printf("bigphant: failed to init license: %v", err)
	} else {
		a.licenseSvc = lic
		lic.StartValidation(ctx)
	}

	if cfg, err := ai.NewConfigStore(); err != nil {
		log.Printf("bigphant: failed to init AI config store: %v", err)
	} else {
		a.aiConfig = cfg
	}
	if cs, err := dbcontext.NewStore(); err != nil {
		log.Printf("bigphant: failed to init context store: %v", err)
	} else {
		a.ctxStore = cs
	}
}

// shutdown closes the active connection pool on app exit.
func (a *App) shutdown(context.Context) {
	if a.conn != nil {
		a.conn.Close()
	}
	a.closeAIConn()
}

// TestResult is returned by TestConnection.
type TestResult struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

// --- Connections -----------------------------------------------------------

func (a *App) ListConnections() ([]connections.ConnectionMeta, error) {
	if a.store == nil {
		return nil, errors.New("connection store unavailable")
	}
	metas, err := a.store.List()
	if err != nil {
		return nil, err
	}
	ordered := a.orderedConnectionIDs()
	for i := range metas {
		if a.licenseSvc != nil {
			metas[i].Locked = apperror.FromLicense(
				a.licenseSvc.ConnectionAllowed(metas[i].ID, ordered),
			) != nil
		}
	}
	return metas, nil
}

func (a *App) CreateConnection(input connections.ConnectionInput) (connections.ConnectionMeta, error) {
	if a.store == nil {
		return connections.ConnectionMeta{}, errors.New("connection store unavailable")
	}
	if err := a.requireLicense(); err != nil {
		return connections.ConnectionMeta{}, err
	}
	if err := a.requireWrite(); err != nil {
		return connections.ConnectionMeta{}, err
	}
	count := a.licenseConnectionCount()
	if a.licenseSvc != nil {
		if err := a.gateLicense(a.licenseSvc.CanAddConnection(count)); err != nil {
			return connections.ConnectionMeta{}, err
		}
	}
	return a.store.Create(input)
}

func (a *App) UpdateConnection(id string, input connections.ConnectionInput) (connections.ConnectionMeta, error) {
	if a.store == nil {
		return connections.ConnectionMeta{}, errors.New("connection store unavailable")
	}
	if err := a.requireWrite(); err != nil {
		return connections.ConnectionMeta{}, err
	}
	return a.store.Update(id, input)
}

// SetConnectionEditMode persists the row-editing method (inline | mixed |
// side_panel) for a connection. It's a UI preference set from the workspace
// topbar, so it is not gated by requireWrite (read-only connections may still
// change how their rows are edited in the grid).
func (a *App) SetConnectionEditMode(id string, mode string) (connections.ConnectionMeta, error) {
	if a.store == nil {
		return connections.ConnectionMeta{}, errors.New("connection store unavailable")
	}
	switch mode {
	case "inline", "mixed", "side_panel":
	default:
		return connections.ConnectionMeta{}, fmt.Errorf("invalid edit mode: %q", mode)
	}
	return a.store.SetEditMode(id, mode)
}

func (a *App) DeleteConnection(id string) error {
	if a.store == nil {
		return errors.New("connection store unavailable")
	}
	if err := a.requireWrite(); err != nil {
		return err
	}
	return a.store.Delete(id)
}

// TestConnection pings a MySQL server using form input. The MySQL error, if
// any, is returned verbatim in the result message (docs/prd.md §3.1 #2).
func (a *App) TestConnection(input connections.ConnectionInput) (TestResult, error) {
	c := connections.Connection{
		Name:            input.Name,
		Host:            input.Host,
		Port:            input.Port,
		Username:        input.Username,
		Password:        input.Password,
		FilePath:        input.FilePath,
		DefaultDatabase: input.DefaultDatabase,
		Driver:          input.Driver,
		SSLMode:         input.SSLMode,
		SSHEnabled:      input.SSHEnabled,
		SSHHost:         input.SSHHost,
		SSHPort:         input.SSHPort,
		SSHUsername:     input.SSHUsername,
		SSHAuthMethod:   input.SSHAuthMethod,
		SSHPassword:     input.SSHPassword,
		SSHKeyPath:      input.SSHKeyPath,
		SSHPrivateKey:   input.SSHPrivateKey,
		SSHPassphrase:   input.SSHPassphrase,
	}
	if err := pingEngine(c); err != nil {
		return TestResult{OK: false, Message: err.Error()}, nil
	}
	return TestResult{OK: true, Message: "Connection successful"}, nil
}

// PickSQLiteFile opens a native file-open dialog for choosing a SQLite database
// file and returns the chosen absolute path ("" if the user cancels). Used by the
// connection form's "Browse…" button.
func (a *App) PickSQLiteFile() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select SQLite database file",
		Filters: []runtime.FileFilter{
			{DisplayName: "SQLite databases", Pattern: "*.db;*.sqlite;*.sqlite3;*.db3"},
			{DisplayName: "All files", Pattern: "*.*"},
		},
	})
}

// OpenConnection opens the saved connection in the current window, replacing
// any previously active pool.
func (a *App) OpenConnection(id string) error {
	if a.store == nil {
		return errors.New("connection store unavailable")
	}
	if err := a.requireLicense(); err != nil {
		return err
	}
	if a.licenseSvc != nil {
		if err := a.gateLicense(a.licenseSvc.ConnectionAllowed(id, a.orderedConnectionIDs())); err != nil {
			return err
		}
	}
	c, err := a.store.Get(id)
	if err != nil {
		return err
	}
	conn, err := openEngine(c)
	if err != nil {
		return err
	}
	if a.conn != nil {
		a.conn.Close()
	}
	a.conn = conn
	a.activeConnID = id
	// The previous AI read-only pool belonged to the prior connection; drop it so
	// the next AI request reopens against the newly active connection.
	a.closeAIConn()
	return nil
}

// --- Browsing --------------------------------------------------------------

func (a *App) requireConn() error {
	if a.conn == nil {
		return errors.New("no active connection")
	}
	return nil
}

func (a *App) ServerVersion() (string, error) {
	if err := a.requireConn(); err != nil {
		return "", err
	}
	return a.conn.Version()
}

// ServerFlavor returns the database engine name: "MySQL" or "MariaDB".
func (a *App) ServerFlavor() (string, error) {
	if err := a.requireConn(); err != nil {
		return "", err
	}
	return a.conn.Flavor(), nil
}

func (a *App) ListDatabases() ([]string, error) {
	if err := a.requireConn(); err != nil {
		return nil, err
	}
	return a.conn.ListDatabases()
}

func (a *App) ListSchemas(database string) ([]string, error) {
	if err := a.requireConn(); err != nil {
		return nil, err
	}
	return a.conn.ListSchemas(database)
}

func (a *App) ListTables(database string) ([]mysql.TableSummary, error) {
	if err := a.requireConn(); err != nil {
		return nil, err
	}
	return a.conn.ListTables(database)
}

func (a *App) ListEntities(database string) ([]dbtypes.Entity, error) {
	if err := a.requireConn(); err != nil {
		return nil, err
	}
	return a.conn.ListEntities(database)
}

func (a *App) EntityDefinition(database, schema, kind, name string) (string, error) {
	if err := a.requireConn(); err != nil {
		return "", err
	}
	return a.conn.EntityDefinition(database, schema, kind, name)
}

func (a *App) DescribeTable(database, table string) (mysql.TableStructure, error) {
	if err := a.requireConn(); err != nil {
		return mysql.TableStructure{}, err
	}
	return a.conn.DescribeTable(database, table)
}

// SchemaColumns returns table→columns for a database, used by SQL-editor
// autocomplete.
func (a *App) SchemaColumns(database string) (map[string][]string, error) {
	if err := a.requireConn(); err != nil {
		return nil, err
	}
	return a.conn.SchemaColumns(database)
}

// FetchRows runs a paginated table-browse SELECT (auto LIMIT 300).
func (a *App) FetchRows(req sqlbuilder.FetchRowsRequest) (mysql.ResultSet, error) {
	if err := a.requireConn(); err != nil {
		return mysql.ResultSet{}, err
	}
	return a.conn.FetchRows(req)
}

// --- Mutations -------------------------------------------------------------

func (a *App) InsertRow(database, table string, values map[string]interface{}) (int64, error) {
	if err := a.requireConn(); err != nil {
		return 0, err
	}
	if err := a.requireWrite(); err != nil {
		return 0, err
	}
	return a.conn.InsertRow(database, table, values)
}

func (a *App) UpdateRow(database, table string, pk, values map[string]interface{}) error {
	if err := a.requireConn(); err != nil {
		return err
	}
	if err := a.requireWrite(); err != nil {
		return err
	}
	return a.conn.UpdateRow(database, table, pk, values)
}

func (a *App) DeleteRows(database, table string, pks []map[string]interface{}) (int64, error) {
	if err := a.requireConn(); err != nil {
		return 0, err
	}
	if err := a.requireWrite(); err != nil {
		return 0, err
	}
	return a.conn.DeleteRows(database, table, pks)
}

// ExecOptions controls raw execution (docs/prd.md §8).
type ExecOptions struct {
	BypassDestructiveCheck bool   `json:"bypass_destructive_check"`
	Database               string `json:"database"`
}

// CommitTransaction commits the active explicit transaction.
func (a *App) CommitTransaction() error {
	if err := a.requireConn(); err != nil {
		return err
	}
	return a.conn.Commit()
}

// RollbackTransaction rolls back the active explicit transaction.
func (a *App) RollbackTransaction() error {
	if err := a.requireConn(); err != nil {
		return err
	}
	return a.conn.Rollback()
}

// ExecuteRaw runs a user-typed SQL string through the server-side destructive
// check and read-only guard.
func (a *App) ExecuteRaw(query string, opts ExecOptions) (mysql.RawResult, error) {
	if err := a.requireConn(); err != nil {
		return mysql.RawResult{}, err
	}
	if sqlbuilder.IsSchemaDDL(query) && a.licenseSvc != nil {
		if err := a.gateLicense(a.licenseSvc.Require(license.FeatModifySchema)); err != nil {
			return mysql.RawResult{}, err
		}
	}
	if !sqlbuilder.IsReadOnly(query) {
		if err := a.requireWrite(); err != nil {
			return mysql.RawResult{}, err
		}
	}
	return a.conn.ExecuteRaw(query, opts.Database, opts.BypassDestructiveCheck, a.settings.AllowDestructiveWithoutWhere)
}

// --- Settings --------------------------------------------------------------

func (a *App) GetSettings() (settings.AppSettings, error) {
	return a.settings, nil
}

func (a *App) UpdateSettings(s settings.AppSettings) error {
	if a.settingsStore != nil {
		if err := a.settingsStore.Save(s); err != nil {
			return err
		}
	}
	a.settings = s
	// Note: the live connection's transaction mode is authoritative per-connection
	// (set from connection.transaction_mode at OpenConnection). The global setting
	// is only the default for new connections, so changing it here must NOT
	// override an open connection — doing so desyncs the frontend Commit/Rollback
	// bar from the actual transaction state and can leave rows locked.
	return nil
}

// SetActiveDatabase switches the active database for the current connection
// context. For Postgres this reconnects the pool to the new database.
func (a *App) SetActiveDatabase(database string) error {
	if a.store == nil {
		return errors.New("connection store unavailable")
	}
	if a.activeConnID == "" {
		return errors.New("no active connection")
	}
	// If the active driver is MySQL, the app passes the database explicitly in
	// every browse call; no reconnect is required.
	if a.conn != nil {
		if a.conn.Flavor() != "PostgreSQL" {
			return nil
		}
	}
	c, err := a.store.Get(a.activeConnID)
	if err != nil {
		return err
	}
	c.DefaultDatabase = database
	conn, err := openEngine(c)
	if err != nil {
		return err
	}
	if a.conn != nil {
		a.conn.Close()
	}
	a.conn = conn
	return nil
}

func openEngine(c connections.Connection) (engine.Engine, error) {
	switch c.Driver {
	case "", "mysql", "mariadb":
		// MariaDB is wire-compatible with go-sql-driver/mysql; the engine
		// detects the actual flavor at connect time (see detectFlavor).
		return mysql.Open(c)
	case "postgres":
		return postgres.Open(c, c.SSLMode)
	case "sqlite":
		return sqlite.Open(c)
	default:
		return nil, fmt.Errorf("unsupported driver %q", c.Driver)
	}
}

func pingEngine(c connections.Connection) error {
	switch c.Driver {
	case "", "mysql", "mariadb":
		return mysql.Ping(c)
	case "postgres":
		conn, err := postgres.Open(c, c.SSLMode)
		if err != nil {
			return err
		}
		return conn.Close()
	case "sqlite":
		return sqlite.Ping(c)
	default:
		return fmt.Errorf("unsupported driver %q", c.Driver)
	}
}
