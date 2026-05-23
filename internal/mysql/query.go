package mysql

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"bigphant/internal/sqlbuilder"
)

// FetchRows runs a paginated table-browse SELECT and returns a ResultSet whose
// values are JSON-friendly (see convertValue).
func (c *Conn) FetchRows(req sqlbuilder.FetchRowsRequest) (ResultSet, error) {
	var rs ResultSet
	query, args, err := sqlbuilder.BuildSelect(req)
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
func scanResult(rows *sql.Rows, rs *ResultSet) error {
	colTypes, err := rows.ColumnTypes()
	if err != nil {
		return err
	}
	rs.Columns = make([]Column, len(colTypes))
	for i, ct := range colTypes {
		rs.Columns[i] = Column{Name: ct.Name(), Type: ct.DatabaseTypeName()}
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
			row[i] = convertValue(v, colTypes[i])
		}
		rs.Rows = append(rs.Rows, row)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rs.RowCount = len(rs.Rows)
	return nil
}

// convertValue normalizes a driver value into something the frontend grid can
// render: JSON columns become objects (so the grid shows a "{…}" badge),
// dates/datetimes become readable strings, and other []byte become strings.
func convertValue(v any, ct *sql.ColumnType) any {
	switch val := v.(type) {
	case nil:
		return nil
	case []byte:
		if ct.DatabaseTypeName() == "JSON" {
			var parsed any
			if err := json.Unmarshal(val, &parsed); err == nil {
				return parsed
			}
		}
		return string(val)
	case time.Time:
		if ct.DatabaseTypeName() == "DATE" {
			return val.Format("2006-01-02")
		}
		return val.Format("2006-01-02 15:04:05")
	default:
		return val
	}
}
