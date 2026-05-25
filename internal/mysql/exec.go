package mysql

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

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

// InsertRow inserts a single row and returns the LAST_INSERT_ID (0 if none).
func (c *Conn) InsertRow(database, table string, values map[string]any) (int64, error) {
	if c.Meta.ReadOnly {
		return 0, errReadOnly
	}
	query, args, err := sqlbuilder.BuildInsert(database, table, values)
	if err != nil {
		return 0, err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.ensureTx(ctx); err != nil {
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
func (c *Conn) UpdateRow(database, table string, pk, values map[string]any) error {
	if c.Meta.ReadOnly {
		return errReadOnly
	}
	query, args, err := sqlbuilder.BuildUpdate(database, table, pk, values)
	if err != nil {
		return err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.ensureTx(ctx); err != nil {
		return err
	}
	_, err = c.exec(ctx, query, args...)
	return err
}

// DeleteRows deletes rows matching any of the given primary keys and returns
// the affected count.
func (c *Conn) DeleteRows(database, table string, pks []map[string]any) (int64, error) {
	if c.Meta.ReadOnly {
		return 0, errReadOnly
	}
	query, args, err := sqlbuilder.BuildDelete(database, table, pks)
	if err != nil {
		return 0, err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.ensureTx(ctx); err != nil {
		return 0, err
	}
	res, err := c.exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ExecuteRaw runs a user-typed statement, applying the server-side destructive
// check (docs/prd.md §9) and the read-only guard. If database is non-empty, a
// dedicated connection is acquired and USE is issued before the query so that
// the user's selected database is active regardless of the pool's default.
func (c *Conn) ExecuteRaw(query, database string, bypass, allowDestructive bool) (RawResult, error) {
	if sqlbuilder.Classify(query) && !bypass {
		if !allowDestructive {
			return RawResult{Status: "destructive_blocked"}, nil
		}
		return RawResult{Status: "destructive_confirm"}, nil
	}
	if c.Meta.ReadOnly && !sqlbuilder.IsReadOnly(query) {
		return RawResult{}, errReadOnly
	}

	ctx, cancel := c.execCtx()
	defer cancel()
	start := time.Now()

	// If a transaction is already open, run directly on it so the statement
	// sees and participates in the uncommitted work.
	if tx := c.activeTx(); tx != nil {
		if sqlbuilder.IsReadOnly(query) {
			rows, err := tx.QueryContext(ctx, query)
			if err != nil {
				return RawResult{}, err
			}
			defer rows.Close()
			rs := ResultSet{SQL: query}
			if err := scanResult(rows, &rs); err != nil {
				return RawResult{}, err
			}
			return RawResult{
				IsQuery:    true,
				ResultSet:  &rs,
				DurationMs: int(time.Since(start).Milliseconds()),
				Status:     "ok",
			}, nil
		}
		if err := c.ensureTx(ctx); err != nil {
			return RawResult{}, err
		}
		res, err := tx.ExecContext(ctx, query)
		if err != nil {
			return RawResult{}, err
		}
		affected, _ := res.RowsAffected()
		return RawResult{
			AffectedRows: affected,
			DurationMs:   int(time.Since(start).Milliseconds()),
			Status:       "ok",
		}, nil
	}

	// No active transaction — use a dedicated connection so we can switch the
	// database context without affecting other pool connections.
	conn, err := c.DB.Conn(ctx)
	if err != nil {
		return RawResult{}, err
	}
	defer conn.Close()

	if database != "" {
		escaped := strings.ReplaceAll(database, "`", "``")
		if _, err := conn.ExecContext(ctx, "USE `"+escaped+"`"); err != nil {
			return RawResult{}, err
		}
	}

	// Auto-begin for explicit_commit DML executed via raw SQL.
	if !sqlbuilder.IsReadOnly(query) {
		if err := c.ensureTx(ctx); err != nil {
			return RawResult{}, err
		}
		// ensureTx opened a new tx; re-route to the transaction branch.
		if tx := c.activeTx(); tx != nil {
			res, err := tx.ExecContext(ctx, query)
			if err != nil {
				return RawResult{}, err
			}
			affected, _ := res.RowsAffected()
			return RawResult{
				AffectedRows: affected,
				DurationMs:   int(time.Since(start).Milliseconds()),
				Status:       "ok",
			}, nil
		}
	}

	if sqlbuilder.IsReadOnly(query) {
		rows, err := conn.QueryContext(ctx, query)
		if err != nil {
			return RawResult{}, err
		}
		defer rows.Close()
		rs := ResultSet{SQL: query}
		if err := scanResult(rows, &rs); err != nil {
			return RawResult{}, err
		}
		return RawResult{
			IsQuery:    true,
			ResultSet:  &rs,
			DurationMs: int(time.Since(start).Milliseconds()),
			Status:     "ok",
		}, nil
	}

	res, err := conn.ExecContext(ctx, query)
	if err != nil {
		return RawResult{}, err
	}
	affected, _ := res.RowsAffected()
	return RawResult{
		AffectedRows: affected,
		DurationMs:   int(time.Since(start).Milliseconds()),
		Status:       "ok",
	}, nil
}
