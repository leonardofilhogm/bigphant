package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"

	"bigphant/internal/dbtypes"
	"bigphant/internal/sqlbuilder"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// exportRowLimit caps an export. FetchRows always appends a LIMIT, so we pass a
// value large enough to mean "all rows" for the PoC's table sizes.
const exportRowLimit = math.MaxInt32

// exportRows fetches every row of a table and writes it to a user-chosen file
// as CSV or SQL INSERT statements. Called by ExportRows after license gating.
func (a *App) exportRows(database, table, format string) error {
	if err := a.requireConn(); err != nil {
		return err
	}
	format = strings.ToLower(format)
	if format != "csv" && format != "sql" {
		return fmt.Errorf("unsupported export format: %q", format)
	}

	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export " + table,
		DefaultFilename: table + "." + format,
		Filters:         []runtime.FileFilter{exportFilter(format)},
	})
	if err != nil {
		return err
	}
	if path == "" {
		return nil // user cancelled the dialog
	}
	if filepath.Ext(path) == "" {
		path += "." + format
	}

	rs, err := a.conn.FetchRows(sqlbuilder.FetchRowsRequest{
		Database: database,
		Table:    table,
		Limit:    exportRowLimit,
	})
	if err != nil {
		return err
	}

	var buf bytes.Buffer
	switch format {
	case "csv":
		if err := writeCSV(&buf, rs); err != nil {
			return err
		}
	case "sql":
		writeSQL(&buf, a.exportDialect(), database, table, rs)
	}

	return os.WriteFile(path, buf.Bytes(), 0o644)
}

func exportFilter(format string) runtime.FileFilter {
	if format == "sql" {
		return runtime.FileFilter{DisplayName: "SQL (*.sql)", Pattern: "*.sql"}
	}
	return runtime.FileFilter{DisplayName: "CSV (*.csv)", Pattern: "*.csv"}
}

// exportDialect picks the quoting rules matching the active connection so SQL
// exports are valid for the target engine.
func (a *App) exportDialect() sqlbuilder.Dialect {
	if a.conn != nil && a.conn.Flavor() == "PostgreSQL" {
		return sqlbuilder.PostgresDialect{}
	}
	return sqlbuilder.MySQLDialect{}
}

func writeCSV(buf *bytes.Buffer, rs dbtypes.ResultSet) error {
	w := csv.NewWriter(buf)

	header := make([]string, len(rs.Columns))
	for i, c := range rs.Columns {
		header[i] = c.Name
	}
	if err := w.Write(header); err != nil {
		return err
	}

	rec := make([]string, len(rs.Columns))
	for _, row := range rs.Rows {
		for i := range rs.Columns {
			rec[i] = csvCell(cellAt(row, i))
		}
		if err := w.Write(rec); err != nil {
			return err
		}
	}
	w.Flush()
	return w.Error()
}

func writeSQL(buf *bytes.Buffer, d sqlbuilder.Dialect, namespace, table string, rs dbtypes.ResultSet) {
	if len(rs.Rows) == 0 {
		return
	}
	cols := make([]string, len(rs.Columns))
	for i, c := range rs.Columns {
		cols[i] = d.QuoteIdent(c.Name)
	}
	prefix := "INSERT INTO " + d.Qualified(namespace, table) + " (" + strings.Join(cols, ", ") + ") VALUES "
	_, isPostgres := d.(sqlbuilder.PostgresDialect)

	vals := make([]string, len(rs.Columns))
	for _, row := range rs.Rows {
		for i := range rs.Columns {
			vals[i] = sqlLiteral(cellAt(row, i), isPostgres)
		}
		buf.WriteString(prefix)
		buf.WriteByte('(')
		buf.WriteString(strings.Join(vals, ", "))
		buf.WriteString(");\n")
	}
}

func cellAt(row []any, i int) any {
	if i < len(row) {
		return row[i]
	}
	return nil
}

func csvCell(v any) string {
	switch val := v.(type) {
	case nil:
		return ""
	case string:
		return val
	case []byte:
		return string(val)
	case bool:
		if val {
			return "true"
		}
		return "false"
	case map[string]any, []any:
		b, _ := json.Marshal(val)
		return string(b)
	default:
		return fmt.Sprint(val)
	}
}

func sqlLiteral(v any, isPostgres bool) string {
	switch val := v.(type) {
	case nil:
		return "NULL"
	case bool:
		if val {
			return "TRUE"
		}
		return "FALSE"
	case int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64,
		float32, float64:
		return fmt.Sprint(val)
	case map[string]any, []any:
		b, _ := json.Marshal(val)
		return sqlQuote(string(b), isPostgres)
	case []byte:
		return sqlQuote(string(val), isPostgres)
	case string:
		return sqlQuote(val, isPostgres)
	default:
		return sqlQuote(fmt.Sprint(val), isPostgres)
	}
}

func sqlQuote(s string, isPostgres bool) string {
	s = strings.ReplaceAll(s, "'", "''")
	if !isPostgres {
		// MySQL treats backslash as an escape character in its default mode.
		s = strings.ReplaceAll(s, "\\", "\\\\")
	}
	return "'" + s + "'"
}
