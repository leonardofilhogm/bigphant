package engine

import (
	"bigphant/internal/dbtypes"
	"bigphant/internal/sqlbuilder"
)

// Engine is the backend-only database engine contract implemented by each
// connector (MySQL, Postgres, ...). The frontend never talks to an engine
// directly; it calls Wails methods on App which delegate here.
type Engine interface {
	// lifecycle
	Close() error
	Ping() error
	Version() (string, error)
	Flavor() string

	// browsing / introspection
	ListDatabases() ([]string, error)
	// ListSchemas lists namespaces within the currently active database context.
	// For MySQL, this may return an empty slice.
	ListSchemas(database string) ([]string, error)
	ListTables(database string) ([]dbtypes.TableSummary, error)
	ListEntities(database string) ([]dbtypes.Entity, error)
	EntityDefinition(database, schema, kind, name string) (string, error)
	DescribeTable(database, table string) (dbtypes.TableStructure, error)
	SchemaColumns(database string) (map[string][]string, error)

	// data
	FetchRows(req sqlbuilder.FetchRowsRequest) (dbtypes.ResultSet, error)
	InsertRow(database, table string, values map[string]any) (int64, error)
	UpdateRow(database, table string, pk, values map[string]any) error
	DeleteRows(database, table string, pks []map[string]any) (int64, error)
	ExecuteRaw(query, database string, bypass, allowDestructive bool) (dbtypes.RawResult, error)
	AlterTable(req sqlbuilder.AlterTableRequest) (dbtypes.RawResult, error)

	// transactions
	SetTxMode(mode string)
	Commit() error
	Rollback() error
}

// MaintenanceEngine is an optional capability for server administration
// (users, databases, activity, maintenance ops). Not every connector implements
// it — SQLite only supports RunMaintenance.
type MaintenanceEngine interface {
	ListUsers() ([]dbtypes.ServerUser, error)
	CreateUser(req dbtypes.CreateUserRequest) error
	DropUser(name, host string) error
	ListGrants(name, host string) ([]dbtypes.Grant, error)
	ApplyGrants(req dbtypes.GrantRequest) error
	CreateDatabase(req dbtypes.CreateDatabaseRequest) error
	ListCharsets() ([]dbtypes.Charset, error)
	ListActivity() ([]dbtypes.ServerProcess, error)
	KillProcess(id string) error
	ListLocks() ([]dbtypes.LockInfo, error)
	RunMaintenance(op string, target string) (dbtypes.RawResult, error)
	Capabilities() dbtypes.ServerCapabilities
}

