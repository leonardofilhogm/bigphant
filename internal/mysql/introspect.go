package mysql

import (
	"context"
	"database/sql"
	"time"
)

func ctx5() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 15*time.Second)
}

// Version returns the MySQL server version string (e.g. "8.0.36").
func (c *Conn) Version() (string, error) {
	ctx, cancel := ctx5()
	defer cancel()
	var v string
	if err := c.DB.QueryRowContext(ctx, "SELECT VERSION()").Scan(&v); err != nil {
		return "", err
	}
	return v, nil
}

// ListDatabases returns the schemas the user can see (SHOW DATABASES).
func (c *Conn) ListDatabases() ([]string, error) {
	ctx, cancel := ctx5()
	defer cancel()
	rows, err := c.DB.QueryContext(ctx, "SHOW DATABASES")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dbs []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		dbs = append(dbs, name)
	}
	return dbs, rows.Err()
}

// ListTables returns base tables in a database with approximate row counts,
// engine, and size (from INFORMATION_SCHEMA — counts are approximate for
// InnoDB, see docs/prd.md §11).
func (c *Conn) ListTables(database string) ([]TableSummary, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT TABLE_NAME,
		       COALESCE(TABLE_ROWS, 0),
		       COALESCE(ENGINE, ''),
		       COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0)
		FROM INFORMATION_SCHEMA.TABLES
		WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
		ORDER BY TABLE_NAME`
	rows, err := c.DB.QueryContext(ctx, q, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []TableSummary
	for rows.Next() {
		var t TableSummary
		if err := rows.Scan(&t.Name, &t.RowCount, &t.Engine, &t.SizeBytes); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// DescribeTable returns columns, indexes, and the primary key for a table.
func (c *Conn) DescribeTable(database, table string) (TableStructure, error) {
	var ts TableStructure

	cols, pk, err := c.columns(database, table)
	if err != nil {
		return ts, err
	}
	idx, err := c.indexes(database, table)
	if err != nil {
		return ts, err
	}
	ts.Columns = cols
	ts.PrimaryKey = pk
	ts.Indexes = idx
	return ts, nil
}

func (c *Conn) columns(database, table string) ([]ColumnInfo, []string, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		ORDER BY ORDINAL_POSITION`
	rows, err := c.DB.QueryContext(ctx, q, database, table)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var cols []ColumnInfo
	var pk []string
	for rows.Next() {
		var (
			name, colType, nullable, key, extra string
			def                                  sql.NullString
		)
		if err := rows.Scan(&name, &colType, &nullable, &def, &key, &extra); err != nil {
			return nil, nil, err
		}
		ci := ColumnInfo{
			Name:     name,
			Type:     colType,
			Nullable: nullable == "YES",
			Key:      key,
			Extra:    extra,
		}
		if def.Valid {
			ci.Default = &def.String
		}
		cols = append(cols, ci)
		if key == "PRI" {
			pk = append(pk, name)
		}
	}
	return cols, pk, rows.Err()
}

func (c *Conn) indexes(database, table string) ([]IndexInfo, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
		FROM INFORMATION_SCHEMA.STATISTICS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		ORDER BY INDEX_NAME, SEQ_IN_INDEX`
	rows, err := c.DB.QueryContext(ctx, q, database, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Preserve first-seen index order while grouping columns.
	order := []string{}
	byName := map[string]*IndexInfo{}
	for rows.Next() {
		var (
			name, col string
			nonUnique int
		)
		if err := rows.Scan(&name, &nonUnique, &col); err != nil {
			return nil, err
		}
		idx, ok := byName[name]
		if !ok {
			idx = &IndexInfo{Name: name, Unique: nonUnique == 0}
			byName[name] = idx
			order = append(order, name)
		}
		idx.Columns = append(idx.Columns, col)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]IndexInfo, 0, len(order))
	for _, name := range order {
		out = append(out, *byName[name])
	}
	return out, nil
}
