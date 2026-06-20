package sqlite

import (
	"context"
	"database/sql"
	"encoding/hex"
	"time"

	"bigphant/internal/dbtypes"
	"bigphant/internal/sqlbuilder"
)

// FetchRows runs a paginated table-browse SELECT and returns a ResultSet whose
// values are JSON-friendly (see convertValue).
func (c *Conn) FetchRows(req sqlbuilder.FetchRowsRequest) (dbtypes.ResultSet, error) {
	var rs dbtypes.ResultSet
	query, args, err := sqlbuilder.BuildSelectDialect(sqlbuilder.SQLiteDialect{}, req)
	if err != nil {
		return rs, err
	}
	rs.SQL = query

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rows, err := c.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return rs, err
	}
	defer rows.Close()

	if err := scanResult(rows, &rs); err != nil {
		return rs, err
	}
	return rs, nil
}

// scanResult fills rs.Columns/Rows/RowCount from an open *sql.Rows. Shared by
// FetchRows and ExecuteRaw (SELECT path).
func scanResult(rows *sql.Rows, rs *dbtypes.ResultSet) error {
	colTypes, err := rows.ColumnTypes()
	if err != nil {
		return err
	}
	rs.Columns = make([]dbtypes.Column, len(colTypes))
	for i, ct := range colTypes {
		rs.Columns[i] = dbtypes.Column{Name: ct.Name(), Type: ct.DatabaseTypeName()}
	}

	for rows.Next() {
		vals := make([]any, len(colTypes))
		ptrs := make([]any, len(colTypes))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return err
		}
		row := make([]any, len(vals))
		for i, v := range vals {
			row[i] = convertValue(v)
		}
		rs.Rows = append(rs.Rows, row)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rs.RowCount = len(rs.Rows)
	return nil
}

// convertValue normalizes a SQLite/driver value into something the frontend grid
// can render. modernc returns INTEGER as int64, REAL as float64, TEXT as string,
// BLOB as []byte, and NULL as nil; declared date/time columns may arrive as
// time.Time.
func convertValue(v any) any {
	switch val := v.(type) {
	case nil:
		return nil
	case []byte:
		// BLOB — a stable, readable hex form prefixed to distinguish from text.
		return "\\x" + hex.EncodeToString(val)
	case time.Time:
		return val.Format("2006-01-02 15:04:05")
	default:
		return val
	}
}
