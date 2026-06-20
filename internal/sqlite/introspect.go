package sqlite

import (
	"context"
	"database/sql"
	"sort"
	"time"

	"bigphant/internal/dbtypes"
	"bigphant/internal/sqlbuilder"
)

func ctx5() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 15*time.Second)
}

// quoteIdent quotes an identifier for safe interpolation into PRAGMA statements,
// which do not accept bound parameters.
func quoteIdent(name string) string {
	return sqlbuilder.SQLiteDialect{}.QuoteIdent(name)
}

// ListDatabases returns the single logical database for this file. SQLite has no
// multi-database namespace, so the UI shows one entry named after the file.
func (c *Conn) ListDatabases() ([]string, error) {
	name := c.dbName
	if name == "" {
		name = "main"
	}
	return []string{name}, nil
}

// ListSchemas is not applicable to SQLite (one file is one database). It returns
// an empty list, matching the MySQL connector.
func (c *Conn) ListSchemas(_ string) ([]string, error) {
	return []string{}, nil
}

// ListTables returns the base tables in the file. SQLite keeps no cheap
// row-count or size metadata, so those fields are left zero.
func (c *Conn) ListTables(_ string) ([]dbtypes.TableSummary, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT name
		FROM sqlite_master
		WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
		ORDER BY name`
	rows, err := c.DB.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []dbtypes.TableSummary
	for rows.Next() {
		var t dbtypes.TableSummary
		if err := rows.Scan(&t.Name); err != nil {
			return nil, err
		}
		t.Engine = "SQLite"
		out = append(out, t)
	}
	return out, rows.Err()
}

// SchemaColumns returns every table/view column keyed by object name in a single
// round trip. It backs SQL-editor autocomplete.
func (c *Conn) SchemaColumns(_ string) (map[string][]string, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT m.name AS object_name, p.name AS column_name
		FROM sqlite_master m
		JOIN pragma_table_info(m.name) p
		WHERE m.type IN ('table', 'view') AND m.name NOT LIKE 'sqlite_%'
		ORDER BY m.name, p.cid`
	rows, err := c.DB.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][]string{}
	for rows.Next() {
		var object, column string
		if err := rows.Scan(&object, &column); err != nil {
			return nil, err
		}
		out[object] = append(out[object], column)
	}
	return out, rows.Err()
}

// DescribeTable returns columns, indexes, and the primary key for a table.
func (c *Conn) DescribeTable(_, table string) (dbtypes.TableStructure, error) {
	var ts dbtypes.TableStructure

	cols, pk, err := c.columns(table)
	if err != nil {
		return ts, err
	}
	idx, err := c.indexes(table)
	if err != nil {
		return ts, err
	}
	ts.Columns = cols
	ts.PrimaryKey = pk
	ts.Indexes = idx
	return ts, nil
}

type pkColumn struct {
	name string
	seq  int
}

func (c *Conn) columns(table string) ([]dbtypes.ColumnInfo, []string, error) {
	ctx, cancel := ctx5()
	defer cancel()
	rows, err := c.DB.QueryContext(ctx, "PRAGMA table_info("+quoteIdent(table)+")")
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var cols []dbtypes.ColumnInfo
	var pks []pkColumn
	for rows.Next() {
		var (
			cid      int
			name     string
			declType string
			notNull  int
			dflt     sql.NullString
			pk       int
		)
		if err := rows.Scan(&cid, &name, &declType, &notNull, &dflt, &pk); err != nil {
			return nil, nil, err
		}
		ci := dbtypes.ColumnInfo{
			Name:     name,
			Type:     declType,
			Nullable: notNull == 0,
		}
		if dflt.Valid {
			ci.Default = &dflt.String
		}
		if pk > 0 {
			ci.Key = "PRI"
			pks = append(pks, pkColumn{name: name, seq: pk})
		}
		cols = append(cols, ci)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	// PRAGMA table_info reports the 1-based position of each column within the
	// primary key in the pk field; order the key accordingly.
	sort.Slice(pks, func(i, j int) bool { return pks[i].seq < pks[j].seq })
	pk := make([]string, len(pks))
	for i, p := range pks {
		pk[i] = p.name
	}
	return cols, pk, nil
}

func (c *Conn) indexes(table string) ([]dbtypes.IndexInfo, error) {
	ctx, cancel := ctx5()
	defer cancel()
	rows, err := c.DB.QueryContext(ctx, "PRAGMA index_list("+quoteIdent(table)+")")
	if err != nil {
		return nil, err
	}

	type idxMeta struct {
		name   string
		unique bool
	}
	var metas []idxMeta
	for rows.Next() {
		var (
			seq     int
			name    string
			unique  int
			origin  string
			partial int
		)
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			rows.Close()
			return nil, err
		}
		metas = append(metas, idxMeta{name: name, unique: unique == 1})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	out := make([]dbtypes.IndexInfo, 0, len(metas))
	for _, m := range metas {
		cols, err := c.indexColumns(ctx, m.name)
		if err != nil {
			return nil, err
		}
		out = append(out, dbtypes.IndexInfo{Name: m.name, Columns: cols, Unique: m.unique})
	}
	return out, nil
}

func (c *Conn) indexColumns(ctx context.Context, index string) ([]string, error) {
	rows, err := c.DB.QueryContext(ctx, "PRAGMA index_info("+quoteIdent(index)+")")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var (
			seqno int
			cid   int
			name  sql.NullString
		)
		if err := rows.Scan(&seqno, &cid, &name); err != nil {
			return nil, err
		}
		// name is NULL for expression columns; skip those.
		if name.Valid {
			cols = append(cols, name.String)
		}
	}
	return cols, rows.Err()
}
