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

// ServerCapabilities describes which maintenance features an engine supports.
type ServerCapabilities struct {
	ManageUsers      bool     `json:"manage_users"`
	ManageDatabases  bool     `json:"manage_databases"`
	ViewActivity     bool     `json:"view_activity"`
	MaintenanceOps   []string `json:"maintenance_ops"`
}

// ServerUser is a database login (MySQL user@host or Postgres role).
type ServerUser struct {
	Name        string `json:"name"`
	Host        string `json:"host"` // MySQL only; "" for Postgres
	CanLogin    bool   `json:"can_login"`
	IsSuperuser bool   `json:"is_superuser"`
}

// Grant is a set of privileges on a database (and optional schema for Postgres).
type Grant struct {
	Database    string   `json:"database"`
	Schema      string   `json:"schema"`
	Privileges  []string `json:"privileges"`
}

// GrantRequest applies or revokes privileges for a user.
type GrantRequest struct {
	User        string   `json:"user"`
	Host        string   `json:"host"`
	Database    string   `json:"database"`
	Schema      string   `json:"schema"`
	Privileges  []string `json:"privileges"`
	Revoke      bool     `json:"revoke"`
}

// CreateUserRequest creates a new server login.
type CreateUserRequest struct {
	Name        string `json:"name"`
	Host        string `json:"host"`
	Password    string `json:"password"` // empty → server generates
	CanLogin    bool   `json:"can_login"`
	IsSuperuser bool   `json:"is_superuser"`
}

// CreateDatabaseRequest creates a new database.
type CreateDatabaseRequest struct {
	Name       string `json:"name"`
	Charset    string `json:"charset"`
	Collation  string `json:"collation"`
	Encoding   string `json:"encoding"`
	Owner      string `json:"owner"`
}

// Charset describes a character set / encoding with available collations.
type Charset struct {
	Name              string   `json:"name"`
	DefaultCollation  string   `json:"default_collation"`
	Collations        []string `json:"collations"`
}

// ServerProcess is one row of the server activity list.
type ServerProcess struct {
	ID       string `json:"id"`
	User     string `json:"user"`
	Host     string `json:"host"`
	Database string `json:"database"`
	Command  string `json:"command"`
	TimeSec  int    `json:"time_sec"`
	State    string `json:"state"`
	Query    string `json:"query"`
}

// LockInfo describes a lock wait or blocking situation.
type LockInfo struct {
	LockType      string `json:"lock_type"`
	Database      string `json:"database"`
	Table         string `json:"table"`
	Index         string `json:"index"`
	BlockedBy     string `json:"blocked_by"`
	BlockedQuery  string `json:"blocked_query"`
	WaitSec       int    `json:"wait_sec"`
}

