package mysql

import (
	"context"
	"errors"
	"strings"
	"time"

	"bigphant/internal/sqlbuilder"
)

var errReadOnly = errors.New("connection is read-only: only SELECT statements are allowed")

func (c *Conn) execCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 30*time.Second)
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
	res, err := c.DB.ExecContext(ctx, query, args...)
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
	_, err = c.DB.ExecContext(ctx, query, args...)
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
	res, err := c.DB.ExecContext(ctx, query, args...)
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
