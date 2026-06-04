package postgres

import (
	"context"
	"database/sql"
	"time"

	"bigphant/internal/dbtypes"
)

func ctx15() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 15*time.Second)
}

func detectVersion(db *sql.DB) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var v string
	if err := db.QueryRowContext(ctx, "SHOW server_version").Scan(&v); err != nil {
		return ""
	}
	return v
}

// ListDatabases lists databases visible to the user. Note: switching databases
// requires reconnecting with a new pool; this call is informational.
func (c *Conn) ListDatabases() ([]string, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`
	rows, err := c.DB.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

// ListTables lists base tables within a schema (the "database" level in the UI
// for Postgres). Charset is the current database collation — Postgres has no
// per-table charset; see ParseCharset for display.
func (c *Conn) ListTables(schema string) ([]dbtypes.TableSummary, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `
		SELECT c.relname,
		       GREATEST(COALESCE(c.reltuples, 0), 0)::bigint AS approx_rows,
		       ''                                            AS engine,
		       pg_total_relation_size(c.oid)                 AS size_bytes,
		       pg_relation_size(c.oid)                       AS data_size_bytes,
		       pg_indexes_size(c.oid)                        AS index_size_bytes,
		       COALESCE(d.datcollate, '')                    AS datcollate
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_database d ON d.datname = current_database()
		WHERE n.nspname = $1 AND c.relkind = 'r'
		ORDER BY c.relname`
	rows, err := c.DB.QueryContext(ctx, q, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []dbtypes.TableSummary
	for rows.Next() {
		var t dbtypes.TableSummary
		var datcollate string
		if err := rows.Scan(
			&t.Name, &t.RowCount, &t.Engine, &t.SizeBytes,
			&t.DataSizeBytes, &t.IndexSizeBytes, &datcollate,
		); err != nil {
			return nil, err
		}
		t.Charset = dbtypes.ParseCharset(datcollate)
		out = append(out, t)
	}
	return out, rows.Err()
}

// ListSchemas lists schemas in the current database (excluding system schemas).
// The database argument is ignored because the pool is already pinned to a
// database; switching databases requires reconnecting.
func (c *Conn) ListSchemas(_ string) ([]string, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `
		SELECT schema_name
		FROM information_schema.schemata
		WHERE schema_name NOT IN ('pg_catalog','information_schema')
		  AND schema_name NOT LIKE 'pg_temp%' AND schema_name NOT LIKE 'pg_toast%'
		ORDER BY schema_name`
	rows, err := c.DB.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

// SchemaColumns returns every base-table column in a schema keyed by table name.
func (c *Conn) SchemaColumns(schema string) (map[string][]string, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `
		SELECT table_name, column_name
		FROM information_schema.columns
		WHERE table_schema = $1
		ORDER BY table_name, ordinal_position`
	rows, err := c.DB.QueryContext(ctx, q, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][]string{}
	for rows.Next() {
		var table, col string
		if err := rows.Scan(&table, &col); err != nil {
			return nil, err
		}
		out[table] = append(out[table], col)
	}
	return out, rows.Err()
}

// DescribeTable returns columns, indexes, and the primary key for a table.
func (c *Conn) DescribeTable(schema, table string) (dbtypes.TableStructure, error) {
	var ts dbtypes.TableStructure

	cols, pk, err := c.columns(schema, table)
	if err != nil {
		return ts, err
	}
	idx, err := c.indexes(schema, table, pk)
	if err != nil {
		return ts, err
	}
	ts.Columns = cols
	ts.PrimaryKey = pk
	ts.Indexes = idx
	return ts, nil
}

func (c *Conn) columns(schema, table string) ([]dbtypes.ColumnInfo, []string, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `
		SELECT column_name,
		       data_type,
		       is_nullable,
		       column_default,
		       ((is_identity = 'YES') OR (COALESCE(column_default, '') LIKE 'nextval(%')) AS is_auto
		FROM information_schema.columns
		WHERE table_schema = $1 AND table_name = $2
		ORDER BY ordinal_position`
	rows, err := c.DB.QueryContext(ctx, q, schema, table)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	auto := map[string]bool{}
	var cols []dbtypes.ColumnInfo
	for rows.Next() {
		var (
			name, dataType, nullable string
			def                      sql.NullString
			isAuto                   bool
		)
		if err := rows.Scan(&name, &dataType, &nullable, &def, &isAuto); err != nil {
			return nil, nil, err
		}
		ci := dbtypes.ColumnInfo{
			Name:     name,
			Type:     dataType,
			Nullable: nullable == "YES",
			Extra:    "",
			Key:      "",
		}
		if def.Valid {
			ci.Default = &def.String
		}
		if isAuto {
			ci.Extra = "auto_increment"
			auto[name] = true
		}
		cols = append(cols, ci)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	// Primary key columns.
	//
	// Use pg_catalog instead of information_schema to avoid edge cases around
	// constraint schema/name joins and to preserve correct column order.
	const pkq = `
		SELECT a.attname
		FROM pg_index i
		JOIN pg_class t       ON t.oid = i.indrelid
		JOIN pg_namespace n   ON n.oid = t.relnamespace
		JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
		JOIN pg_attribute a   ON a.attrelid = t.oid AND a.attnum = k.attnum
		WHERE i.indisprimary
		  AND n.nspname = $1
		  AND t.relname = $2
		ORDER BY k.ord`
	pkRows, err := c.DB.QueryContext(ctx, pkq, schema, table)
	if err != nil {
		return nil, nil, err
	}
	defer pkRows.Close()

	var pk []string
	pkSet := map[string]bool{}
	for pkRows.Next() {
		var col string
		if err := pkRows.Scan(&col); err != nil {
			return nil, nil, err
		}
		pk = append(pk, col)
		pkSet[col] = true
	}
	if err := pkRows.Err(); err != nil {
		return nil, nil, err
	}

	// Fallback: some setups (notably certain partitioned-table shapes or
	// compatibility layers) can cause the pg_catalog join above to return no
	// rows. Try information_schema with a stricter constraint_schema join.
	if len(pk) == 0 {
		const pkq2 = `
			SELECT kcu.column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
			  ON kcu.constraint_name = tc.constraint_name
			 AND kcu.constraint_schema = tc.constraint_schema
			 AND kcu.table_schema = tc.table_schema
			 AND kcu.table_name = tc.table_name
			WHERE tc.constraint_type = 'PRIMARY KEY'
			  AND tc.table_schema = $1 AND tc.table_name = $2
			ORDER BY kcu.ordinal_position`
		pkRows2, err := c.DB.QueryContext(ctx, pkq2, schema, table)
		if err != nil {
			return nil, nil, err
		}
		defer pkRows2.Close()
		for pkRows2.Next() {
			var col string
			if err := pkRows2.Scan(&col); err != nil {
				return nil, nil, err
			}
			pk = append(pk, col)
			pkSet[col] = true
		}
		if err := pkRows2.Err(); err != nil {
			return nil, nil, err
		}
	}

	// Backfill Key field to match MySQL vocab so the frontend can stay unchanged.
	for i := range cols {
		if pkSet[cols[i].Name] {
			cols[i].Key = "PRI"
		}
	}
	return cols, pk, nil
}

func (c *Conn) indexes(schema, table string, pk []string) ([]dbtypes.IndexInfo, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `
		SELECT i.relname AS index_name,
		       ix.indisunique AS is_unique,
		       a.attname AS column_name
		FROM pg_class t
		JOIN pg_index ix      ON t.oid = ix.indrelid
		JOIN pg_class i       ON i.oid = ix.indexrelid
		JOIN pg_namespace n   ON n.oid = t.relnamespace
		JOIN pg_attribute a   ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
		WHERE n.nspname = $1 AND t.relname = $2
		ORDER BY i.relname, array_position(ix.indkey, a.attnum)`
	rows, err := c.DB.QueryContext(ctx, q, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	order := []string{}
	byName := map[string]*dbtypes.IndexInfo{}
	for rows.Next() {
		var (
			name, col string
			unique    bool
		)
		if err := rows.Scan(&name, &unique, &col); err != nil {
			return nil, err
		}
		idx, ok := byName[name]
		if !ok {
			idx = &dbtypes.IndexInfo{Name: name, Unique: unique}
			byName[name] = idx
			order = append(order, name)
		}
		idx.Columns = append(idx.Columns, col)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]dbtypes.IndexInfo, 0, len(order))
	for _, name := range order {
		out = append(out, *byName[name])
	}
	return out, nil
}

