package main

import (
	"fmt"

	"bigphant/internal/dbtypes"
	"bigphant/internal/engine"
	"bigphant/internal/license"
)

func (a *App) maintEngine() (engine.MaintenanceEngine, error) {
	if err := a.requireConn(); err != nil {
		return nil, err
	}
	me, ok := a.conn.(engine.MaintenanceEngine)
	if !ok {
		return nil, fmt.Errorf("maintenance is not supported by this engine")
	}
	return me, nil
}

func (a *App) requireMaintWrite() error {
	if a.licenseSvc != nil {
		if err := a.gateLicense(a.licenseSvc.Require(license.FeatModifySchema)); err != nil {
			return err
		}
	}
	return a.requireWrite()
}

// ServerCapabilities returns which maintenance features the active engine supports.
func (a *App) ServerCapabilities() (dbtypes.ServerCapabilities, error) {
	me, err := a.maintEngine()
	if err != nil {
		return dbtypes.ServerCapabilities{}, err
	}
	return me.Capabilities(), nil
}

// ListUsers returns server login accounts (MySQL users or Postgres roles).
func (a *App) ListUsers() ([]dbtypes.ServerUser, error) {
	me, err := a.maintEngine()
	if err != nil {
		return nil, err
	}
	return me.ListUsers()
}

// CreateUser creates a new server login. Password is generated server-side when empty.
func (a *App) CreateUser(req dbtypes.CreateUserRequest) error {
	me, err := a.maintEngine()
	if err != nil {
		return err
	}
	if err := a.requireMaintWrite(); err != nil {
		return err
	}
	return me.CreateUser(req)
}

// DropUser removes a server login.
func (a *App) DropUser(name, host string) error {
	me, err := a.maintEngine()
	if err != nil {
		return err
	}
	if err := a.requireMaintWrite(); err != nil {
		return err
	}
	return me.DropUser(name, host)
}

// ListGrants returns privileges for a user on each database.
func (a *App) ListGrants(name, host string) ([]dbtypes.Grant, error) {
	me, err := a.maintEngine()
	if err != nil {
		return nil, err
	}
	return me.ListGrants(name, host)
}

// ApplyGrants grants or revokes privileges for a user.
func (a *App) ApplyGrants(req dbtypes.GrantRequest) error {
	me, err := a.maintEngine()
	if err != nil {
		return err
	}
	if err := a.requireMaintWrite(); err != nil {
		return err
	}
	return me.ApplyGrants(req)
}

// CreateDatabase creates a new database on the server.
func (a *App) CreateDatabase(req dbtypes.CreateDatabaseRequest) error {
	me, err := a.maintEngine()
	if err != nil {
		return err
	}
	if err := a.requireMaintWrite(); err != nil {
		return err
	}
	return me.CreateDatabase(req)
}

// ListCharsets returns available character sets / encodings for database creation.
func (a *App) ListCharsets() ([]dbtypes.Charset, error) {
	me, err := a.maintEngine()
	if err != nil {
		return nil, err
	}
	return me.ListCharsets()
}

// ListActivity returns running server processes / queries.
func (a *App) ListActivity() ([]dbtypes.ServerProcess, error) {
	me, err := a.maintEngine()
	if err != nil {
		return nil, err
	}
	return me.ListActivity()
}

// KillProcess terminates a running server process.
func (a *App) KillProcess(id string) error {
	me, err := a.maintEngine()
	if err != nil {
		return err
	}
	if err := a.requireMaintWrite(); err != nil {
		return err
	}
	return me.KillProcess(id)
}

// ListLocks returns lock wait information.
func (a *App) ListLocks() ([]dbtypes.LockInfo, error) {
	me, err := a.maintEngine()
	if err != nil {
		return nil, err
	}
	return me.ListLocks()
}

// RunMaintenance runs a maintenance operation (VACUUM, ANALYZE, OPTIMIZE, etc.).
func (a *App) RunMaintenance(op, target string) (dbtypes.RawResult, error) {
	me, err := a.maintEngine()
	if err != nil {
		return dbtypes.RawResult{}, err
	}
	if err := a.requireMaintWrite(); err != nil {
		return dbtypes.RawResult{}, err
	}
	return me.RunMaintenance(op, target)
}
