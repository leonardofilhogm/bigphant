package main

import (
	"context"
	"errors"
	"log"

	"bigphant/internal/connections"
	"bigphant/internal/mysql"
	"bigphant/internal/settings"
	"bigphant/internal/sqlbuilder"
)

// App is the Wails-bound application struct. It owns the connection store and
// this window's single active MySQL connection (docs/prd.md §5).
type App struct {
	ctx           context.Context
	store         *connections.Store
	settingsStore *settings.Store
	settings      settings.AppSettings
	conn          *mysql.Conn
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	store, err := connections.NewStore()
	if err != nil {
		log.Printf("bigphant: failed to init connection store: %v", err)
		return
	}
	a.store = store

	a.settings = settings.Defaults()
	ss, err := settings.NewStore()
	if err != nil {
		log.Printf("bigphant: failed to init settings store: %v", err)
		return
	}
	a.settingsStore = ss
	if loaded, err := ss.Load(); err != nil {
		log.Printf("bigphant: failed to load settings: %v", err)
	} else {
		a.settings = loaded
	}
}

// shutdown closes the active connection pool on app exit.
func (a *App) shutdown(context.Context) {
	a.conn.Close()
}

// TestResult is returned by TestConnection.
type TestResult struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

// --- Connections -----------------------------------------------------------

func (a *App) ListConnections() ([]connections.ConnectionMeta, error) {
	if a.store == nil {
		return nil, errors.New("connection store unavailable")
	}
	return a.store.List()
}

func (a *App) CreateConnection(input connections.ConnectionInput) (connections.ConnectionMeta, error) {
	if a.store == nil {
		return connections.ConnectionMeta{}, errors.New("connection store unavailable")
	}
	return a.store.Create(input)
}

func (a *App) UpdateConnection(id string, input connections.ConnectionInput) (connections.ConnectionMeta, error) {
	if a.store == nil {
		return connections.ConnectionMeta{}, errors.New("connection store unavailable")
	}
	return a.store.Update(id, input)
}

func (a *App) DeleteConnection(id string) error {
	if a.store == nil {
		return errors.New("connection store unavailable")
	}
	return a.store.Delete(id)
}

// TestConnection pings a MySQL server using form input. The MySQL error, if
// any, is returned verbatim in the result message (docs/prd.md §3.1 #2).
func (a *App) TestConnection(input connections.ConnectionInput) (TestResult, error) {
	c := connections.Connection{
		Name:            input.Name,
		Host:            input.Host,
		Port:            input.Port,
		Username:        input.Username,
		Password:        input.Password,
		DefaultDatabase: input.DefaultDatabase,
	}
	if err := mysql.Ping(c); err != nil {
		return TestResult{OK: false, Message: err.Error()}, nil
	}
	return TestResult{OK: true, Message: "Connection successful"}, nil
}

// OpenConnection opens the saved connection in the current window, replacing
// any previously active pool.
func (a *App) OpenConnection(id string) error {
	if a.store == nil {
		return errors.New("connection store unavailable")
	}
	c, err := a.store.Get(id)
	if err != nil {
		return err
	}
	conn, err := mysql.Open(c)
	if err != nil {
		return err
	}
	a.conn.Close()
	a.conn = conn
	return nil
}

// --- Browsing --------------------------------------------------------------

func (a *App) requireConn() error {
	if a.conn == nil {
		return errors.New("no active connection")
	}
	return nil
}

func (a *App) ServerVersion() (string, error) {
	if err := a.requireConn(); err != nil {
		return "", err
	}
	return a.conn.Version()
}

func (a *App) ListDatabases() ([]string, error) {
	if err := a.requireConn(); err != nil {
		return nil, err
	}
	return a.conn.ListDatabases()
}

func (a *App) ListTables(database string) ([]mysql.TableSummary, error) {
	if err := a.requireConn(); err != nil {
		return nil, err
	}
	return a.conn.ListTables(database)
}

func (a *App) DescribeTable(database, table string) (mysql.TableStructure, error) {
	if err := a.requireConn(); err != nil {
		return mysql.TableStructure{}, err
	}
	return a.conn.DescribeTable(database, table)
}

// SchemaColumns returns table→columns for a database, used by SQL-editor
// autocomplete.
func (a *App) SchemaColumns(database string) (map[string][]string, error) {
	if err := a.requireConn(); err != nil {
		return nil, err
	}
	return a.conn.SchemaColumns(database)
}

// FetchRows runs a paginated table-browse SELECT (auto LIMIT 300).
func (a *App) FetchRows(req sqlbuilder.FetchRowsRequest) (mysql.ResultSet, error) {
	if err := a.requireConn(); err != nil {
		return mysql.ResultSet{}, err
	}
	return a.conn.FetchRows(req)
}

// --- Mutations -------------------------------------------------------------

func (a *App) InsertRow(database, table string, values map[string]interface{}) (int64, error) {
	if err := a.requireConn(); err != nil {
		return 0, err
	}
	return a.conn.InsertRow(database, table, values)
}

func (a *App) UpdateRow(database, table string, pk, values map[string]interface{}) error {
	if err := a.requireConn(); err != nil {
		return err
	}
	return a.conn.UpdateRow(database, table, pk, values)
}

func (a *App) DeleteRows(database, table string, pks []map[string]interface{}) (int64, error) {
	if err := a.requireConn(); err != nil {
		return 0, err
	}
	return a.conn.DeleteRows(database, table, pks)
}

// ExecOptions controls raw execution (docs/prd.md §8).
type ExecOptions struct {
	BypassDestructiveCheck bool   `json:"bypass_destructive_check"`
	Database               string `json:"database"`
}

// CommitTransaction commits the active explicit transaction.
func (a *App) CommitTransaction() error {
	if err := a.requireConn(); err != nil {
		return err
	}
	return a.conn.Commit()
}

// RollbackTransaction rolls back the active explicit transaction.
func (a *App) RollbackTransaction() error {
	if err := a.requireConn(); err != nil {
		return err
	}
	return a.conn.Rollback()
}

// ExecuteRaw runs a user-typed SQL string through the server-side destructive
// check and read-only guard.
func (a *App) ExecuteRaw(query string, opts ExecOptions) (mysql.RawResult, error) {
	if err := a.requireConn(); err != nil {
		return mysql.RawResult{}, err
	}
	return a.conn.ExecuteRaw(query, opts.Database, opts.BypassDestructiveCheck, a.settings.AllowDestructiveWithoutWhere)
}

// --- Settings --------------------------------------------------------------

func (a *App) GetSettings() (settings.AppSettings, error) {
	return a.settings, nil
}

func (a *App) UpdateSettings(s settings.AppSettings) error {
	if a.settingsStore != nil {
		if err := a.settingsStore.Save(s); err != nil {
			return err
		}
	}
	a.settings = s
	if a.conn != nil {
		a.conn.SetTxMode(s.DefaultTransactionMode)
	}
	return nil
}
