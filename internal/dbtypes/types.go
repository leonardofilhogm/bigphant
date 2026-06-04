package dbtypes

import "strings"

// Shared DTOs returned across the Wails bridge. JSON tags must match the
// frontend types in frontend/src/lib/types.ts.

// Column is a result-set column header.
type Column struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// ResultSet is a generic tabular result (table browse or SELECT).
type ResultSet struct {
	Columns  []Column `json:"columns"`
	Rows     [][]any  `json:"rows"`
	RowCount int      `json:"row_count"`
	SQL      string   `json:"sql"`
}

// RawResult is returned by ExecuteRaw: either a SELECT result set or an
// affected-rows count, plus a status that drives the destructive-op modal.
type RawResult struct {
	IsQuery      bool       `json:"is_query"`
	ResultSet    *ResultSet `json:"result_set,omitempty"`
	AffectedRows int64      `json:"affected_rows"`
	DurationMs   int        `json:"duration_ms"`
	Status       string     `json:"status"` // "ok" | "destructive_blocked" | "destructive_confirm"
}

// TableSummary is one row of the database table listing.
type TableSummary struct {
	Name           string `json:"name"`
	RowCount       int64  `json:"row_count"`
	Engine         string `json:"engine"`
	SizeBytes      int64  `json:"size_bytes"` // data + index
	DataSizeBytes  int64  `json:"data_size_bytes"`
	IndexSizeBytes int64  `json:"index_size_bytes"`
	Charset        string `json:"charset"`
}

// ParseCharset extracts a short charset label from a collation string.
// MySQL: "utf8mb4_unicode_ci" → "utf8mb4". Postgres: "en_US.utf8" → "utf8".
func ParseCharset(collation string) string {
	if collation == "" {
		return ""
	}
	if i := strings.LastIndex(collation, "."); i >= 0 && i < len(collation)-1 {
		return collation[i+1:]
	}
	if i := strings.Index(collation, "_"); i > 0 {
		return collation[:i]
	}
	return collation
}

// ColumnInfo describes a column in the structure view.
type ColumnInfo struct {
	Name     string  `json:"name"`
	Type     string  `json:"type"`
	Nullable bool    `json:"nullable"`
	Default  *string `json:"default"`
	Key      string  `json:"key"`   // "PRI" | "UNI" | "MUL" | ""
	Extra    string  `json:"extra"` // e.g. "auto_increment"
}

// IndexInfo describes a table index.
type IndexInfo struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Unique  bool     `json:"unique"`
}

// TableStructure is the full DESCRIBE-style payload for a table.
type TableStructure struct {
	Columns    []ColumnInfo `json:"columns"`
	Indexes    []IndexInfo  `json:"indexes"`
	PrimaryKey []string     `json:"primary_key"`
}

// Entity is a non-table database object (view, routine, trigger, …).
type Entity struct {
	Name   string `json:"name"`
	Kind   string `json:"kind"`
	Schema string `json:"schema"` // Postgres only; "" for MySQL
	Owner  string `json:"owner"`
	Extra  string `json:"extra"`
}

