package postgres

import (
	"time"

	"bigphant/internal/dbtypes"
	"bigphant/internal/sqlbuilder"
)

// AlterTable executes structured DDL built server-side.
func (c *Conn) AlterTable(req sqlbuilder.AlterTableRequest) (dbtypes.RawResult, error) {
	if c.Meta.ReadOnly {
		return dbtypes.RawResult{}, errReadOnly
	}
	stmts, _, err := sqlbuilder.BuildAlterTable(sqlbuilder.PostgresDialect{}, req)
	if err != nil {
		return dbtypes.RawResult{}, err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.ensureTx(); err != nil {
		return dbtypes.RawResult{}, err
	}
	start := time.Now()
	var affected int64
	for _, stmt := range stmts {
		res, err := c.exec(ctx, stmt)
		if err != nil {
			return dbtypes.RawResult{}, err
		}
		n, _ := res.RowsAffected()
		affected += n
	}
	return dbtypes.RawResult{
		AffectedRows: affected,
		DurationMs:   int(time.Since(start).Milliseconds()),
		Status:       "ok",
	}, nil
}
