package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"bigphant/internal/dbtypes"
	"bigphant/internal/maint"
	"bigphant/internal/sqlbuilder"
)

func (c *Conn) Capabilities() dbtypes.ServerCapabilities {
	return dbtypes.ServerCapabilities{
		ManageUsers:     true,
		ManageDatabases: true,
		ViewActivity:    true,
		MaintenanceOps:  []string{"VACUUM", "ANALYZE"},
	}
}

func (c *Conn) maintWrite() error {
	if c.Meta.ReadOnly {
		return errReadOnly
	}
	return nil
}

func (c *Conn) maintExec(ctx context.Context, query string) error {
	if err := c.maintWrite(); err != nil {
		return err
	}
	_, err := c.DB.ExecContext(ctx, query)
	return err
}

func (c *Conn) ListUsers() ([]dbtypes.ServerUser, error) {
	ctx, cancel := c.execCtx()
	defer cancel()
	query := `SELECT rolname, rolcanlogin, rolsuper FROM pg_roles
		WHERE rolcanlogin OR rolsuper ORDER BY rolname`
	rows, err := c.DB.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.ServerUser
	for rows.Next() {
		var u dbtypes.ServerUser
		if err := rows.Scan(&u.Name, &u.CanLogin, &u.IsSuperuser); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (c *Conn) CreateUser(req dbtypes.CreateUserRequest) error {
	password := req.Password
	if password == "" {
		var err error
		password, err = maint.RandomPassword()
		if err != nil {
			return err
		}
	}
	sql, err := maint.BuildCreateUserPostgres(req.Name, password, req.CanLogin, req.IsSuperuser)
	if err != nil {
		return err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.maintExec(ctx, sql); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "already exists") {
			d := sqlbuilder.PostgresDialect{}
			alter := fmt.Sprintf("ALTER ROLE %s WITH ", d.QuoteIdent(req.Name))
			opts := []string{}
			if req.CanLogin {
				opts = append(opts, "LOGIN")
			}
			if req.IsSuperuser {
				opts = append(opts, "SUPERUSER")
			}
			opts = append(opts, "PASSWORD "+sqlbuilder.QuoteStringLiteral(password))
			return c.maintExec(ctx, alter+strings.Join(opts, " "))
		}
		return err
	}
	return nil
}

func (c *Conn) DropUser(name, _ string) error {
	sql, err := maint.BuildDropUserPostgres(name)
	if err != nil {
		return err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	return c.maintExec(ctx, sql)
}

func (c *Conn) ListGrants(name, _ string) ([]dbtypes.Grant, error) {
	ctx, cancel := c.execCtx()
	defer cancel()
	query := fmt.Sprintf(`SELECT grantee, privilege_type, table_catalog, table_schema
		FROM information_schema.role_table_grants WHERE grantee = %s
		UNION ALL
		SELECT grantee, privilege_type, table_catalog, '' AS table_schema
		FROM information_schema.role_usage_grants WHERE grantee = %s`,
		sqlbuilder.QuoteStringLiteral(name), sqlbuilder.QuoteStringLiteral(name))
	rows, err := c.DB.QueryContext(ctx, query)
	if err != nil {
		// Fallback: query pg_catalog
		return c.listGrantsFromDB(ctx, name)
	}
	defer rows.Close()
	byKey := map[string]map[string]bool{}
	for rows.Next() {
		var grantee, priv, catalog, schema sql.NullString
		if err := rows.Scan(&grantee, &priv, &catalog, &schema); err != nil {
			return nil, err
		}
		key := catalog.String + "|" + schema.String
		if byKey[key] == nil {
			byKey[key] = map[string]bool{}
		}
		byKey[key][strings.ToUpper(priv.String)] = true
	}
	var out []dbtypes.Grant
	for key, privs := range byKey {
		parts := strings.SplitN(key, "|", 2)
		g := dbtypes.Grant{Database: parts[0], Schema: parts[1]}
		for p := range privs {
			g.Privileges = append(g.Privileges, p)
		}
		out = append(out, g)
	}
	if len(out) > 0 {
		return out, rows.Err()
	}
	return c.listGrantsFromDB(ctx, name)
}

func (c *Conn) listGrantsFromDB(ctx context.Context, name string) ([]dbtypes.Grant, error) {
	query := fmt.Sprintf(`SELECT datname FROM pg_database d
		JOIN pg_shdepend dep ON dep.refobjid = d.oid
		JOIN pg_roles r ON r.oid = dep.objid
		WHERE r.rolname = %s`, sqlbuilder.QuoteStringLiteral(name))
	rows, err := c.DB.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.Grant
	for rows.Next() {
		var dbName string
		if err := rows.Scan(&dbName); err != nil {
			return nil, err
		}
		out = append(out, dbtypes.Grant{
			Database:   dbName,
			Privileges: []string{"CONNECT"},
		})
	}
	return out, rows.Err()
}

func (c *Conn) ApplyGrants(req dbtypes.GrantRequest) error {
	schema := req.Schema
	if schema == "" {
		schema = "public"
	}
	var stmts []string
	if req.Revoke {
		if len(req.Privileges) > 0 && isDatabasePriv(req.Privileges) {
			s, e := maint.BuildRevokePostgresDatabase(req.User, req.Database, req.Privileges)
			if e != nil {
				return e
			}
			stmts = append(stmts, s)
		}
		s, e := maint.BuildRevokePostgresSchema(req.User, schema, req.Privileges)
		if e != nil {
			return e
		}
		stmts = append(stmts, s)
	} else {
		if req.Database != "" {
			stmt, e := maint.BuildGrantPostgresDatabase(req.User, req.Database, []string{"CONNECT"})
			if e != nil {
				return e
			}
			stmts = append(stmts, stmt)
		}
		stmt, err := maint.BuildGrantPostgresSchema(req.User, schema, req.Privileges)
		if err != nil {
			return err
		}
		stmts = append(stmts, stmt)
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	for _, s := range stmts {
		if err := c.maintExec(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

func isDatabasePriv(privs []string) bool {
	for _, p := range privs {
		up := strings.ToUpper(p)
		if up == "CONNECT" || up == "CREATE" || up == "TEMPORARY" || up == "TEMP" {
			return true
		}
	}
	return false
}

func (c *Conn) CreateDatabase(req dbtypes.CreateDatabaseRequest) error {
	sql, err := maint.BuildCreateDatabasePostgres(req.Name, req.Encoding, req.Owner)
	if err != nil {
		return err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	return c.maintExec(ctx, sql)
}

func (c *Conn) ListCharsets() ([]dbtypes.Charset, error) {
	ctx, cancel := c.execCtx()
	defer cancel()
	query := `SELECT pg_encoding_to_char(encoding) AS enc FROM pg_catalog.pg_encoding_to_char
		CROSS JOIN generate_series(0, 10) AS s(i) WHERE false
		UNION SELECT DISTINCT pg_encoding_to_char(encoding) FROM pg_database ORDER BY 1`
	// Simpler: list from pg_encoding
	query = `SELECT DISTINCT pg_encoding_to_char(encoding) AS enc FROM pg_database ORDER BY 1`
	rows, err := c.DB.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.Charset
	for rows.Next() {
		var enc string
		if err := rows.Scan(&enc); err != nil {
			return nil, err
		}
		out = append(out, dbtypes.Charset{Name: enc, DefaultCollation: enc})
	}
	return out, rows.Err()
}

func (c *Conn) ListActivity() ([]dbtypes.ServerProcess, error) {
	ctx, cancel := c.execCtx()
	defer cancel()
	query := `SELECT pid, usename, COALESCE(client_addr::text, ''), COALESCE(datname, ''),
		state, EXTRACT(EPOCH FROM (now() - query_start))::int, COALESCE(query, '')
		FROM pg_stat_activity
		WHERE pid <> pg_backend_pid()
		ORDER BY query_start NULLS LAST`
	rows, err := c.DB.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.ServerProcess
	for rows.Next() {
		var p dbtypes.ServerProcess
		var pid int64
		var state sql.NullString
		var timeSec sql.NullInt64
		if err := rows.Scan(&pid, &p.User, &p.Host, &p.Database, &state, &timeSec, &p.Query); err != nil {
			return nil, err
		}
		p.ID = strconv.FormatInt(pid, 10)
		p.Command = state.String
		p.State = state.String
		p.TimeSec = int(timeSec.Int64)
		out = append(out, p)
	}
	return out, rows.Err()
}

func (c *Conn) KillProcess(id string) error {
	pid, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid process id")
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.maintWrite(); err != nil {
		return err
	}
	var ok bool
	if err := c.DB.QueryRowContext(ctx, "SELECT pg_terminate_backend($1)", pid).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("could not terminate backend %s", id)
	}
	return nil
}

func (c *Conn) ListLocks() ([]dbtypes.LockInfo, error) {
	ctx, cancel := c.execCtx()
	defer cancel()
	query := `SELECT l.locktype, COALESCE(l.database::regclass::text, ''), COALESCE(l.relation::regclass::text, ''),
		COALESCE(a.usename, ''), COALESCE(a.query, ''),
		EXTRACT(EPOCH FROM (now() - a.query_start))::int
		FROM pg_locks l
		LEFT JOIN pg_stat_activity a ON a.pid = l.pid
		WHERE NOT l.granted
		LIMIT 200`
	rows, err := c.DB.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.LockInfo
	for rows.Next() {
		var li dbtypes.LockInfo
		var user, queryText sql.NullString
		var waitSec sql.NullInt64
		if err := rows.Scan(&li.LockType, &li.Database, &li.Table, &user, &queryText, &waitSec); err != nil {
			return nil, err
		}
		li.BlockedBy = user.String
		li.BlockedQuery = queryText.String
		li.WaitSec = int(waitSec.Int64)
		out = append(out, li)
	}
	return out, rows.Err()
}

func (c *Conn) RunMaintenance(op, target string) (dbtypes.RawResult, error) {
	if err := c.maintWrite(); err != nil {
		return dbtypes.RawResult{}, err
	}
	op = strings.ToUpper(strings.TrimSpace(op))
	target = strings.TrimSpace(target)
	var query string
	d := sqlbuilder.PostgresDialect{}
	switch op {
	case "VACUUM":
		if target == "" {
			query = "VACUUM"
		} else if strings.Contains(target, ".") {
			parts := strings.SplitN(target, ".", 2)
			query = "VACUUM " + d.QuoteIdent(parts[0]) + "." + d.QuoteIdent(parts[1])
		} else {
			query = "VACUUM " + d.QuoteIdent(target)
		}
	case "ANALYZE":
		if target == "" {
			query = "ANALYZE"
		} else if strings.Contains(target, ".") {
			parts := strings.SplitN(target, ".", 2)
			query = "ANALYZE " + d.QuoteIdent(parts[0]) + "." + d.QuoteIdent(parts[1])
		} else {
			query = "ANALYZE " + d.QuoteIdent(target)
		}
	default:
		return dbtypes.RawResult{}, fmt.Errorf("unsupported maintenance op %q", op)
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	start := time.Now()
	_, err := c.DB.ExecContext(ctx, query)
	if err != nil {
		return dbtypes.RawResult{}, err
	}
	return dbtypes.RawResult{
		AffectedRows: 0,
		DurationMs:   int(time.Since(start).Milliseconds()),
		Status:       "ok",
	}, nil
}
