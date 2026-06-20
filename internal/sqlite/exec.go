package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"bigphant/internal/dbtypes"
	"bigphant/internal/sqlbuilder"
)

var errReadOnly = errors.New("connection is read-only: only SELECT statements are allowed")

func (c *Conn) execCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 30*time.Second)
}

// exec runs a statement on the active transaction if one is open, otherwise on
// the pool. Callers must call ensureTx first for mutations in explicit mode.
func (c *Conn) exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if tx := c.activeTx(); tx != nil {
		return tx.ExecContext(ctx, query, args...)
	}
	return c.DB.ExecContext(ctx, query, args...)
}

// InsertRow inserts a single row and returns the last inserted rowid (0 if none).
// The database argument is ignored: SQLite has no schema namespace.
func (c *Conn) InsertRow(_, table string, values map[string]any) (int64, error) {
	if c.Meta.ReadOnly {
		return 0, errReadOnly
	}
	query, args, err := sqlbuilder.BuildInsertDialect(sqlbuilder.SQLiteDialect{}, "", table, values)
	if err != nil {
		return 0, err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.ensureTx(); err != nil {
		return 0, err
	}
	res, err := c.exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	return id, nil
}

// UpdateRow updates a single row identified by its primary key.
func (c *Conn) UpdateRow(_, table string, pk, values map[string]any) error {
	if c.Meta.ReadOnly {
		return errReadOnly
	}
	query, args, err := sqlbuilder.BuildUpdateDialect(sqlbuilder.SQLiteDialect{}, "", table, pk, values)
	if err != nil {
		return err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.ensureTx(); err != nil {
		return err
	}
	_, err = c.exec(ctx, query, args...)
	return err
}

// DeleteRows deletes rows matching any of the given primary keys and returns the
// affected count.
func (c *Conn) DeleteRows(_, table string, pks []map[string]any) (int64, error) {
	if c.Meta.ReadOnly {
		return 0, errReadOnly
	}
	query, args, err := sqlbuilder.BuildDeleteDialect(sqlbuilder.SQLiteDialect{}, "", table, pks)
	if err != nil {
		return 0, err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.ensureTx(); err != nil {
		return 0, err
	}
	res, err := c.exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ExecuteRaw runs a user-typed statement, applying the server-side destructive
// check (docs/prd.md §9) and the read-only guard. The database argument is
// ignored — SQLite has a single database per file.
func (c *Conn) ExecuteRaw(query, _ string, bypass, allowDestructive bool) (dbtypes.RawResult, error) {
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

	readOnly := sqlbuilder.IsReadOnly(query)

	// Auto-begin for explicit_commit DML executed via raw SQL so the work lands
	// inside the transaction.
	if !readOnly {
		if err := c.ensureTx(); err != nil {
			return dbtypes.RawResult{}, err
		}
	}

	if readOnly {
		rows, err := c.queryContext(ctx, query)
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

	res, err := c.exec(ctx, query)
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

// queryContext runs a read query on the active transaction if one is open,
// otherwise on the pool.
func (c *Conn) queryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	if tx := c.activeTx(); tx != nil {
		return tx.QueryContext(ctx, query, args...)
	}
	return c.DB.QueryContext(ctx, query, args...)
}
