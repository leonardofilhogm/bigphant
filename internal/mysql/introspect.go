package mysql

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"bigphant/internal/dbtypes"
)

func ctx5() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 15*time.Second)
}

// detectFlavor calls SELECT VERSION() and returns ("MySQL"|"MariaDB", clean version).
// Called once at Open time so all subsequent calls are zero-cost reads.
func detectFlavor(db *sql.DB) (flavor, version string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var raw string
	if err := db.QueryRowContext(ctx, "SELECT VERSION()").Scan(&raw); err != nil {
		return "MySQL", ""
	}
	// MariaDB reports e.g. "10.11.2-MariaDB" or "11.4.2-MariaDB-ubu2204".
	// MySQL reports e.g. "8.0.36" with no dash-suffix containing "MariaDB".
	upper := strings.ToUpper(raw)
	if strings.Contains(upper, "MARIADB") {
		// Extract numeric part before the first "-".
		ver := raw
		if i := strings.Index(raw, "-"); i > 0 {
			ver = raw[:i]
		}
		return "MariaDB", ver
	}
	// MySQL: version string is already a clean numeric value.
	return "MySQL", raw
}

// Version returns the clean numeric server version (e.g. "8.0.36" or "11.4.2").
func (c *Conn) Version() (string, error) {
	return c.version, nil
}

// Flavor returns the database engine name: "MySQL" or "MariaDB".
func (c *Conn) Flavor() string {
	return c.flavor
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

// ListSchemas is not applicable to MySQL in this app's model (databases are the
// primary namespace). It returns an empty list.
func (c *Conn) ListSchemas(_ string) ([]string, error) {
	return []string{}, nil
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
		       COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0),
		       COALESCE(DATA_LENGTH, 0),
		       COALESCE(INDEX_LENGTH, 0),
		       COALESCE(TABLE_COLLATION, '')
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
		var collation string
		if err := rows.Scan(
			&t.Name, &t.RowCount, &t.Engine, &t.SizeBytes,
			&t.DataSizeBytes, &t.IndexSizeBytes, &collation,
		); err != nil {
			return nil, err
		}
		t.Charset = dbtypes.ParseCharset(collation)
		out = append(out, t)
	}
	return out, rows.Err()
}

// SchemaColumns returns every base-table column in a database keyed by table
// name (ordinal order preserved) in a single round trip. It backs SQL-editor
// autocomplete, where one query per table would be too chatty.
func (c *Conn) SchemaColumns(database string) (map[string][]string, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT TABLE_NAME, COLUMN_NAME
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_SCHEMA = ?
		ORDER BY TABLE_NAME, ORDINAL_POSITION`
	rows, err := c.DB.QueryContext(ctx, q, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][]string{}
	for rows.Next() {
		var table, column string
		if err := rows.Scan(&table, &column); err != nil {
			return nil, err
		}
		out[table] = append(out[table], column)
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
