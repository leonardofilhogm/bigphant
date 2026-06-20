package sqlite

import (
	"context"
	"fmt"
	"strings"
	"time"

	"bigphant/internal/dbtypes"
	"bigphant/internal/sqlbuilder"
)

var errMaintUnsupported = fmt.Errorf("not supported by SQLite")

func (c *Conn) Capabilities() dbtypes.ServerCapabilities {
	return dbtypes.ServerCapabilities{
		ManageUsers:     false,
		ManageDatabases: false,
		ViewActivity:    false,
		MaintenanceOps:  []string{"VACUUM", "INTEGRITY_CHECK", "REINDEX"},
	}
}

func (c *Conn) ListUsers() ([]dbtypes.ServerUser, error) {
	return nil, errMaintUnsupported
}

func (c *Conn) CreateUser(_ dbtypes.CreateUserRequest) error {
	return errMaintUnsupported
}

func (c *Conn) DropUser(_, _ string) error {
	return errMaintUnsupported
}

func (c *Conn) ListGrants(_, _ string) ([]dbtypes.Grant, error) {
	return nil, errMaintUnsupported
}

func (c *Conn) ApplyGrants(_ dbtypes.GrantRequest) error {
	return errMaintUnsupported
}

func (c *Conn) CreateDatabase(_ dbtypes.CreateDatabaseRequest) error {
	return errMaintUnsupported
}

func (c *Conn) ListCharsets() ([]dbtypes.Charset, error) {
	return nil, errMaintUnsupported
}

func (c *Conn) ListActivity() ([]dbtypes.ServerProcess, error) {
	return nil, errMaintUnsupported
}

func (c *Conn) KillProcess(_ string) error {
	return errMaintUnsupported
}

func (c *Conn) ListLocks() ([]dbtypes.LockInfo, error) {
	return nil, errMaintUnsupported
}

func (c *Conn) RunMaintenance(op, target string) (dbtypes.RawResult, error) {
	if c.Meta.ReadOnly {
		return dbtypes.RawResult{}, errReadOnly
	}
	op = strings.ToUpper(strings.TrimSpace(op))
	target = strings.TrimSpace(target)
	ctx, cancel := c.execCtx()
	defer cancel()
	start := time.Now()

	switch op {
	case "VACUUM":
		if err := c.maintExec(ctx, "VACUUM"); err != nil {
			return dbtypes.RawResult{}, err
		}
	case "INTEGRITY_CHECK":
		rows, err := c.DB.QueryContext(ctx, "PRAGMA integrity_check")
		if err != nil {
			return dbtypes.RawResult{}, err
		}
		defer rows.Close()
		rs := dbtypes.ResultSet{SQL: "PRAGMA integrity_check"}
		rs.Columns = []dbtypes.Column{{Name: "integrity_check", Type: "TEXT"}}
		for rows.Next() {
			var line string
			if err := rows.Scan(&line); err != nil {
				return dbtypes.RawResult{}, err
			}
			rs.Rows = append(rs.Rows, []any{line})
		}
		rs.RowCount = len(rs.Rows)
		return dbtypes.RawResult{
			IsQuery:    true,
			ResultSet:  &rs,
			DurationMs: int(time.Since(start).Milliseconds()),
			Status:     "ok",
		}, nil
	case "REINDEX":
		var query string
		if target == "" {
			query = "REINDEX"
		} else {
			if err := sqlbuilder.ValidateIdentifier(target); err != nil {
				return dbtypes.RawResult{}, err
			}
			query = "REINDEX " + sqlbuilder.SQLiteDialect{}.QuoteIdent(target)
		}
		if err := c.maintExec(ctx, query); err != nil {
			return dbtypes.RawResult{}, err
		}
	default:
		return dbtypes.RawResult{}, fmt.Errorf("unsupported maintenance op %q", op)
	}

	return dbtypes.RawResult{
		DurationMs: int(time.Since(start).Milliseconds()),
		Status:     "ok",
	}, nil
}

func (c *Conn) maintExec(ctx context.Context, query string) error {
	_, err := c.DB.ExecContext(ctx, query)
	return err
}
