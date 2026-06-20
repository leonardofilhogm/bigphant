package sqlbuilder

import "strings"

// Dialect controls identifier quoting and placeholder formatting for each SQL engine.
// Placeholder n is 1-based.
type Dialect interface {
	QuoteIdent(name string) string
	Placeholder(n int) string
	Qualified(namespace, table string) string
}

// MySQLDialect uses backticks and "?" placeholders. Namespace is a database.
type MySQLDialect struct{}

func (MySQLDialect) QuoteIdent(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

func (MySQLDialect) Placeholder(_ int) string { return "?" }

func (d MySQLDialect) Qualified(database, table string) string {
	if database == "" {
		return d.QuoteIdent(table)
	}
	return d.QuoteIdent(database) + "." + d.QuoteIdent(table)
}

// PostgresDialect uses double-quotes and "$N" placeholders. Namespace is a schema.
type PostgresDialect struct{}

func (PostgresDialect) QuoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func (PostgresDialect) Placeholder(n int) string { return "$" + itoa(n) }

func (d PostgresDialect) Qualified(schema, table string) string {
	if schema == "" {
		return d.QuoteIdent(table)
	}
	return d.QuoteIdent(schema) + "." + d.QuoteIdent(table)
}

// SQLiteDialect uses double-quote identifiers (like Postgres) and "?" placeholders
// (like MySQL). SQLite has no database/schema namespace for table references — one
// file is one database — so Qualified ignores the namespace and quotes the table.
type SQLiteDialect struct{}

func (SQLiteDialect) QuoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func (SQLiteDialect) Placeholder(_ int) string { return "?" }

func (d SQLiteDialect) Qualified(_, table string) string {
	return d.QuoteIdent(table)
}

func itoa(n int) string {
	// small local helper to avoid fmt.Sprintf allocations in hot paths
	if n == 0 {
		return "0"
	}
	var buf [32]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
