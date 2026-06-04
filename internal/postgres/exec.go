package postgres

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"bigphant/internal/dbtypes"
	"bigphant/internal/sqlbuilder"
)

var errReadOnly = errors.New("connection is read-only: only SELECT statements are allowed")

func (c *Conn) execCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 30*time.Second)
}

func (c *Conn) exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if tx := c.activeTx(); tx != nil {
		return tx.ExecContext(ctx, query, args...)
	}
	return c.DB.ExecContext(ctx, query, args...)
}

func (c *Conn) applySearchPath(ctx context.Context, runner interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}, schema string) error {
	if schema == "" {
		return nil
	}
	// Quote the schema identifier safely using the dialect.
	q := `SET search_path TO ` + sqlbuilder.PostgresDialect{}.QuoteIdent(schema)
	_, err := runner.ExecContext(ctx, q)
	return err
}

// InsertRow inserts a single row and returns the generated id when a single PK
// column is present; otherwise returns 0.
func (c *Conn) InsertRow(schema, table string, values map[string]any) (int64, error) {
	if c.Meta.ReadOnly {
		return 0, errReadOnly
	}
	query, args, err := sqlbuilder.BuildInsertDialect(sqlbuilder.PostgresDialect{}, schema, table, values)
	if err != nil {
		return 0, err
	}

	// Best-effort: if the table has exactly one PK column, RETURNING it.
	var pkCol string
	if ts, err := c.DescribeTable(schema, table); err == nil && len(ts.PrimaryKey) == 1 {
		pkCol = ts.PrimaryKey[0]
	}
	if pkCol != "" {
		query += " RETURNING " + sqlbuilder.PostgresDialect{}.QuoteIdent(pkCol)
	}

	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.ensureTx(); err != nil {
		return 0, err
	}
	if tx := c.activeTx(); tx != nil {
		if err := c.applySearchPath(ctx, tx, schema); err != nil {
			return 0, err
		}
	}
	if pkCol == "" {
		_, err := c.exec(ctx, query, args...)
		return 0, err
	}

	// RETURNING path needs QueryRow.
	if tx := c.activeTx(); tx != nil {
		var id any
		if err := tx.QueryRowContext(ctx, query, args...).Scan(&id); err != nil {
			return 0, err
		}
		return coerceInt64(id), nil
	}
	var id any
	if err := c.DB.QueryRowContext(ctx, query, args...).Scan(&id); err != nil {
		return 0, err
	}
	return coerceInt64(id), nil
}

func coerceInt64(v any) int64 {
	switch t := v.(type) {
	case int64:
		return t
	case int32:
		return int64(t)
	case int:
		return int64(t)
	case uint64:
		if t > uint64(^uint64(0)>>1) {
			return 0
		}
		return int64(t)
	case string:
		// avoid strconv import in hot code: simple parse
		var out int64
		sign := int64(1)
		s := t
		if strings.HasPrefix(s, "-") {
			sign = -1
			s = strings.TrimPrefix(s, "-")
		}
		for i := 0; i < len(s); i++ {
			ch := s[i]
			if ch < '0' || ch > '9' {
				return 0
			}
			out = out*10 + int64(ch-'0')
		}
		return out * sign
	default:
		return 0
	}
}

func (c *Conn) UpdateRow(schema, table string, pk, values map[string]any) error {
	if c.Meta.ReadOnly {
		return errReadOnly
	}
	query, args, err := sqlbuilder.BuildUpdateDialect(sqlbuilder.PostgresDialect{}, schema, table, pk, values)
	if err != nil {
		return err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.ensureTx(); err != nil {
		return err
	}
	if tx := c.activeTx(); tx != nil {
		if err := c.applySearchPath(ctx, tx, schema); err != nil {
			return err
		}
	}
	_, err = c.exec(ctx, query, args...)
	return err
}

func (c *Conn) DeleteRows(schema, table string, pks []map[string]any) (int64, error) {
	if c.Meta.ReadOnly {
		return 0, errReadOnly
	}
	query, args, err := sqlbuilder.BuildDeleteDialect(sqlbuilder.PostgresDialect{}, schema, table, pks)
	if err != nil {
		return 0, err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.ensureTx(); err != nil {
		return 0, err
	}
	if tx := c.activeTx(); tx != nil {
		if err := c.applySearchPath(ctx, tx, schema); err != nil {
			return 0, err
		}
	}
	res, err := c.exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ExecuteRaw runs a user-typed statement, applying the server-side destructive
// check and the read-only guard. If schema is non-empty, a dedicated connection
// is acquired and search_path is set before the query so the user's selected
// schema is active regardless of the pool's default.
func (c *Conn) ExecuteRaw(query, schema string, bypass, allowDestructive bool) (dbtypes.RawResult, error) {
	if sqlbuilder.Classify(query) && !bypass {
		if !allowDestructive {
			return dbtypes.RawResult{Status: "destructive_blocked"}, nil
		}
		return dbtypes.RawResult{Status: "destructive_confirm"}, nil
	}
	if c.Meta.ReadOnly && !sqlbuilder.IsReadOnly(query) {
		return dbtypes.RawResult{}, errReadOnly
	}

	ctx, cancel := c.execCtx()
	defer cancel()
	start := time.Now()

	// If a transaction is already open, run directly on it so the statement
	// sees and participates in the uncommitted work.
	if tx := c.activeTx(); tx != nil {
		if err := c.applySearchPath(ctx, tx, schema); err != nil {
			return dbtypes.RawResult{}, err
		}
		if sqlbuilder.IsReadOnly(query) {
			rows, err := tx.QueryContext(ctx, query)
			if err != nil {
				return dbtypes.RawResult{}, err
			}
			defer rows.Close()
			rs := dbtypes.ResultSet{SQL: query}
			if err := scanResult(rows, &rs); err != nil {
				return dbtypes.RawResult{}, err
			}
			return dbtypes.RawResult{
				IsQuery:    true,
				ResultSet:  &rs,
				DurationMs: int(time.Since(start).Milliseconds()),
				Status:     "ok",
			}, nil
		}
		if err := c.ensureTx(); err != nil {
			return dbtypes.RawResult{}, err
		}
		res, err := tx.ExecContext(ctx, query)
		if err != nil {
			return dbtypes.RawResult{}, err
		}
		affected, _ := res.RowsAffected()
		return dbtypes.RawResult{
			AffectedRows: affected,
			DurationMs:   int(time.Since(start).Milliseconds()),
			Status:       "ok",
		}, nil
	}

	// No active transaction — use a dedicated connection so we can set schema
	// context without affecting other pool connections.
	conn, err := c.DB.Conn(ctx)
	if err != nil {
		return dbtypes.RawResult{}, err
	}
	defer conn.Close()

	if err := c.applySearchPath(ctx, conn, schema); err != nil {
		return dbtypes.RawResult{}, err
	}

	// Auto-begin for explicit_commit DML executed via raw SQL.
	if !sqlbuilder.IsReadOnly(query) {
		if err := c.ensureTx(); err != nil {
			return dbtypes.RawResult{}, err
		}
		// ensureTx opened a new tx; re-route to the transaction branch.
		if tx := c.activeTx(); tx != nil {
			if err := c.applySearchPath(ctx, tx, schema); err != nil {
				return dbtypes.RawResult{}, err
			}
			res, err := tx.ExecContext(ctx, query)
			if err != nil {
				return dbtypes.RawResult{}, err
			}
			affected, _ := res.RowsAffected()
			return dbtypes.RawResult{
				AffectedRows: affected,
				DurationMs:   int(time.Since(start).Milliseconds()),
				Status:       "ok",
			}, nil
		}
	}

	if sqlbuilder.IsReadOnly(query) {
		rows, err := conn.QueryContext(ctx, query)
		if err != nil {
			return dbtypes.RawResult{}, err
		}
		defer rows.Close()
		rs := dbtypes.ResultSet{SQL: query}
		if err := scanResult(rows, &rs); err != nil {
			return dbtypes.RawResult{}, err
		}
		return dbtypes.RawResult{
			IsQuery:    true,
			ResultSet:  &rs,
			DurationMs: int(time.Since(start).Milliseconds()),
			Status:     "ok",
		}, nil
	}

	res, err := conn.ExecContext(ctx, query)
	if err != nil {
		return dbtypes.RawResult{}, err
	}
	affected, _ := res.RowsAffected()
	return dbtypes.RawResult{
		AffectedRows: affected,
		DurationMs:   int(time.Since(start).Milliseconds()),
		Status:       "ok",
	}, nil
}

// Ensure Conn satisfies the multi-engine interface at compile time.
var _ interface {
	Close() error
	Ping() error
	Version() (string, error)
	Flavor() string
	ListDatabases() ([]string, error)
	ListTables(string) ([]dbtypes.TableSummary, error)
	DescribeTable(string, string) (dbtypes.TableStructure, error)
	SchemaColumns(string) (map[string][]string, error)
	FetchRows(sqlbuilder.FetchRowsRequest) (dbtypes.ResultSet, error)
	InsertRow(string, string, map[string]any) (int64, error)
	UpdateRow(string, string, map[string]any, map[string]any) error
	DeleteRows(string, string, []map[string]any) (int64, error)
	ExecuteRaw(string, string, bool, bool) (dbtypes.RawResult, error)
	SetTxMode(string)
	Commit() error
	Rollback() error
} = (*Conn)(nil)

