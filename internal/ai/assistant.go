package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// maxToolRounds caps how many times the model may query the database in a single
// turn, bounding cost and preventing runaway loops.
const maxToolRounds = 8

// maxToolRows caps how many rows a single tool result feeds back to the model.
const maxToolRows = 200

// SQLRunner executes a read-only statement and returns its columns and rows. The
// implementation (app layer) is responsible for enforcing read-only access — it
// runs against the dedicated read-only pool and rejects non-SELECT statements.
type SQLRunner func(sql string) (columns []string, rows [][]any, err error)

// ToolEvent is emitted for each run_readonly_sql call so the UI can show what
// the assistant is doing.
type ToolEvent struct {
	SQL      string `json:"sql"`
	RowCount int    `json:"row_count"`
	Error    string `json:"error,omitempty"`
}

// Assistant drives the agentic chat loop.
type Assistant struct {
	client *Client
	model  string
}

// NewAssistant builds an assistant bound to a client and model slug.
func NewAssistant(client *Client, model string) *Assistant {
	return &Assistant{client: client, model: model}
}

var readonlySQLTool = Tool{
	Type: "function",
	Function: ToolFunction{
		Name:        "run_readonly_sql",
		Description: "Run a single read-only SQL SELECT statement against the user's database and return the rows. Only SELECT/SHOW/EXPLAIN/WITH queries are permitted; any attempt to modify data or schema is rejected.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sql": map[string]any{
					"type":        "string",
					"description": "A single read-only SQL statement.",
				},
			},
			"required": []string{"sql"},
		},
	},
}

func systemPrompt(contextMD, database string) string {
	var b strings.Builder
	b.WriteString("You are Bigphant's database assistant. Answer the user's questions about their database in clear, friendly natural language.\n\n")
	b.WriteString("To find answers, call the run_readonly_sql tool with SELECT queries. You may call it multiple times to explore and refine. Never attempt to modify data or schema — only read-only queries are allowed and any other statement will be rejected.\n")
	b.WriteString("Prefer adding LIMIT to exploratory queries. When you have enough information, give a concise answer; include small result tables inline when helpful.\n\n")
	if database != "" {
		fmt.Fprintf(&b, "The active database is %q.\n\n", database)
	}
	if strings.TrimSpace(contextMD) != "" {
		b.WriteString("Here is the schema context for this database. Schemas use TOON tables: ")
		b.WriteString("a header `name[count]{fields}:` followed by one indented, comma-separated ")
		b.WriteString("row per item; comma-bearing values are double-quoted and an empty value means none.\n\n")
		b.WriteString(contextMD)
	} else {
		b.WriteString("No schema context file is available; discover the schema with read-only queries as needed.")
	}
	return b.String()
}

// Run executes one assistant turn: given the prior conversation history (user
// and assistant messages, no system prompt), it loops calling the model and
// executing tool calls until the model returns a final text answer. It returns
// the final answer and the messages appended during this turn (assistant tool
// calls, tool results, and the final assistant message) so the caller can
// persist the running history.
func (a *Assistant) Run(
	ctx context.Context,
	history []Message,
	contextMD, database string,
	runSQL SQLRunner,
	onTool func(ToolEvent),
) (string, []Message, error) {
	messages := make([]Message, 0, len(history)+4)
	messages = append(messages, Message{Role: "system", Content: systemPrompt(contextMD, database)})
	messages = append(messages, history...)

	var appended []Message
	for round := 0; round < maxToolRounds; round++ {
		msg, err := a.client.ChatCompletion(ctx, a.model, messages, []Tool{readonlySQLTool})
		if err != nil {
			return "", appended, err
		}
		messages = append(messages, msg)
		appended = append(appended, msg)

		if len(msg.ToolCalls) == 0 {
			return msg.Content, appended, nil
		}

		for _, call := range msg.ToolCalls {
			result := a.runToolCall(call, runSQL, onTool)
			messages = append(messages, result)
			appended = append(appended, result)
		}
	}
	return "", appended, fmt.Errorf("assistant exceeded %d tool rounds without a final answer", maxToolRounds)
}

// runToolCall executes a single tool call and formats its result as a tool
// message for the model.
func (a *Assistant) runToolCall(call ToolCall, runSQL SQLRunner, onTool func(ToolEvent)) Message {
	toolMsg := Message{Role: "tool", ToolCallID: call.ID, Name: call.Function.Name}

	if call.Function.Name != "run_readonly_sql" {
		toolMsg.Content = fmt.Sprintf("error: unknown tool %q", call.Function.Name)
		return toolMsg
	}

	var args struct {
		SQL string `json:"sql"`
	}
	if err := json.Unmarshal([]byte(call.Function.Arguments), &args); err != nil {
		toolMsg.Content = "error: could not parse tool arguments: " + err.Error()
		return toolMsg
	}

	columns, rows, err := runSQL(args.SQL)
	if err != nil {
		if onTool != nil {
			onTool(ToolEvent{SQL: args.SQL, Error: err.Error()})
		}
		toolMsg.Content = "error: " + err.Error()
		return toolMsg
	}
	if onTool != nil {
		onTool(ToolEvent{SQL: args.SQL, RowCount: len(rows)})
	}
	toolMsg.Content = formatRows(columns, rows)
	return toolMsg
}

// formatRows serializes a result set compactly for the model, capping rows.
func formatRows(columns []string, rows [][]any) string {
	truncated := false
	if len(rows) > maxToolRows {
		rows = rows[:maxToolRows]
		truncated = true
	}
	payload := map[string]any{
		"columns":   columns,
		"rows":      rows,
		"row_count": len(rows),
	}
	if truncated {
		payload["truncated"] = true
		payload["note"] = fmt.Sprintf("only the first %d rows are shown", maxToolRows)
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Sprintf("error: could not serialize rows: %v", err)
	}
	return string(data)
}
