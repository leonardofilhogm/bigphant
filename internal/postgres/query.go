package postgres

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"bigphant/internal/dbtypes"
	"bigphant/internal/sqlbuilder"
)

// FetchRows runs a paginated table-browse SELECT and returns a ResultSet whose
// values are JSON-friendly.
func (c *Conn) FetchRows(req sqlbuilder.FetchRowsRequest) (dbtypes.ResultSet, error) {
	var rs dbtypes.ResultSet
	query, args, err := sqlbuilder.BuildSelectDialect(sqlbuilder.PostgresDialect{}, req)
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

func convertValue(v any, ct *sql.ColumnType) any {
	switch val := v.(type) {
	case nil:
		return nil
	case time.Time:
		// Postgres timestamps are already time.Time from pgx stdlib.
		return val.Format("2006-01-02 15:04:05")
	case []byte:
		// bytea / unknown. For bytea, prefer a short hex string; for json/jsonb
		// attempt to parse.
		switch strings.ToUpper(ct.DatabaseTypeName()) {
		case "JSON", "JSONB":
			var parsed any
			if err := json.Unmarshal(val, &parsed); err == nil {
				return parsed
			}
			return string(val)
		case "BYTEA":
			// hex encoding is stable and readable; prefix to avoid confusion with text.
			return fmt.Sprintf("\\\\x%s", hex.EncodeToString(val))
		default:
			return string(val)
		}
	case [16]byte:
		// Some pgx paths return UUID as [16]byte.
		b := val[:]
		return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
	default:
		return val
	}
}

