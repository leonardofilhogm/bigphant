package main

import (
	"strings"

	"bigphant/internal/apperror"
	"bigphant/internal/dbtypes"
	"bigphant/internal/license"
	"bigphant/internal/sqlbuilder"
)

// AlterPreview is the server-built DDL shown before apply.
type AlterPreview struct {
	SQL         []string `json:"sql"`
	Destructive bool     `json:"destructive"`
}

func (a *App) alterDialect() sqlbuilder.Dialect {
	if a.conn != nil && a.conn.Flavor() != "" {
		// Postgres Conn returns "PostgreSQL"; SQLite returns "SQLite"; MySQL
		// returns "MySQL" or "MariaDB". The preview dialect must match the dialect
		// the engine uses to execute, or the previewed SQL will not match reality.
		fl := strings.ToLower(a.conn.Flavor())
		if strings.Contains(fl, "postgres") {
			return sqlbuilder.PostgresDialect{}
		}
		if strings.Contains(fl, "sqlite") {
			return sqlbuilder.SQLiteDialect{}
		}
	}
	return sqlbuilder.MySQLDialect{}
}

// PreviewAlterTable builds (but does not run) DDL for the structure editor.
func (a *App) PreviewAlterTable(req sqlbuilder.AlterTableRequest) (AlterPreview, error) {
	if err := a.requireConn(); err != nil {
		return AlterPreview{}, err
	}
	if a.licenseSvc != nil {
		if err := a.gateLicense(a.licenseSvc.Require(license.FeatModifySchema)); err != nil {
			return AlterPreview{}, err
		}
	}
	stmts, destructive, err := sqlbuilder.BuildAlterTable(a.alterDialect(), req)
	if err != nil {
		return AlterPreview{}, err
	}
	return AlterPreview{SQL: stmts, Destructive: destructive}, nil
}

// AlterTable validates, gates, and executes structured DDL.
func (a *App) AlterTable(req sqlbuilder.AlterTableRequest, confirmed bool) (dbtypes.RawResult, error) {
	if err := a.requireConn(); err != nil {
		return dbtypes.RawResult{}, err
	}
	if a.licenseSvc != nil {
		if err := a.gateLicense(a.licenseSvc.Require(license.FeatModifySchema)); err != nil {
			return dbtypes.RawResult{}, err
		}
	}
	if err := a.requireWrite(); err != nil {
		return dbtypes.RawResult{}, err
	}
	stmts, destructive, err := sqlbuilder.BuildAlterTable(a.alterDialect(), req)
	if err != nil {
		return dbtypes.RawResult{}, err
	}
	if destructive && !confirmed {
		return dbtypes.RawResult{}, apperror.ConfirmationRequired(strings.Join(stmts, ";\n"))
	}
	return a.conn.AlterTable(req)
}
