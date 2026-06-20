package sqlite

import (
	"time"

	"bigphant/internal/dbtypes"
	"bigphant/internal/sqlbuilder"
)

// AlterTable executes structured DDL built server-side. SQLite's ALTER TABLE is
// limited (see sqlbuilder.buildAlterSQLite); unsupported operations are rejected
// there with a clear message rather than being silently dropped.
func (c *Conn) AlterTable(req sqlbuilder.AlterTableRequest) (dbtypes.RawResult, error) {
	if c.Meta.ReadOnly {
		return dbtypes.RawResult{}, errReadOnly
	}
	stmts, _, err := sqlbuilder.BuildAlterTable(sqlbuilder.SQLiteDialect{}, req)
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

// Ensure *Conn satisfies the engine.Engine contract at compile time.
var _ interface {
	Close() error
	Ping() error
	Version() (string, error)
	Flavor() string
	ListDatabases() ([]string, error)
	ListSchemas(string) ([]string, error)
	ListTables(string) ([]dbtypes.TableSummary, error)
	ListEntities(string) ([]dbtypes.Entity, error)
	EntityDefinition(string, string, string, string) (string, error)
	DescribeTable(string, string) (dbtypes.TableStructure, error)
	SchemaColumns(string) (map[string][]string, error)
	FetchRows(sqlbuilder.FetchRowsRequest) (dbtypes.ResultSet, error)
	InsertRow(string, string, map[string]any) (int64, error)
	UpdateRow(string, string, map[string]any, map[string]any) error
	DeleteRows(string, string, []map[string]any) (int64, error)
	ExecuteRaw(string, string, bool, bool) (dbtypes.RawResult, error)
	AlterTable(sqlbuilder.AlterTableRequest) (dbtypes.RawResult, error)
	SetTxMode(string)
	Commit() error
	Rollback() error
} = (*Conn)(nil)
