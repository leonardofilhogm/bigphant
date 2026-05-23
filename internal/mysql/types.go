package mysql

// Shared DTOs returned across the Wails bridge. JSON tags must match the
// frontend types in frontend/src/lib/types.ts (see docs/prd.md §8).

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
// affected-rows count, plus a status that drives the destructive-op modal
// (docs/prd.md §8, §9).
type RawResult struct {
	IsQuery      bool       `json:"is_query"`
	ResultSet    *ResultSet `json:"result_set,omitempty"`
	AffectedRows int64      `json:"affected_rows"`
	DurationMs   int        `json:"duration_ms"`
	Status       string     `json:"status"` // "ok" | "destructive_blocked" | "destructive_confirm"
}

// TableSummary is one row of the database table listing.
type TableSummary struct {
	Name      string `json:"name"`
	RowCount  int64  `json:"row_count"`
	Engine    string `json:"engine"`
	SizeBytes int64  `json:"size_bytes"`
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
