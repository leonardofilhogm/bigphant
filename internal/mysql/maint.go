package mysql

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"bigphant/internal/dbtypes"
	"bigphant/internal/maint"
	"bigphant/internal/sqlbuilder"

	"github.com/go-sql-driver/mysql"
)

func (c *Conn) Capabilities() dbtypes.ServerCapabilities {
	return dbtypes.ServerCapabilities{
		ManageUsers:     true,
		ManageDatabases: true,
		ViewActivity:    true,
		MaintenanceOps:  []string{"OPTIMIZE", "ANALYZE"},
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
	out, err := c.listUsersFromSystemTable(ctx)
	if err == nil {
		return out, nil
	}
	if !isMySQLPrivilegeError(err) {
		return nil, err
	}
	out, fbErr := c.listUsersFromInformationSchema(ctx)
	if fbErr != nil {
		return nil, fmt.Errorf("%w (fallback via information_schema also failed: %v)", err, fbErr)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("%w: connect with an account that has SELECT on mysql.user to list all server users", err)
	}
	return out, nil
}

func (c *Conn) listUsersFromSystemTable(ctx context.Context) ([]dbtypes.ServerUser, error) {
	rows, err := c.DB.QueryContext(ctx, "SELECT user, host FROM mysql.user ORDER BY user, host")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanServerUsers(rows)
}

const listUsersFromInfoSchemaSQL = `
SELECT DISTINCT GRANTEE
FROM (
  SELECT GRANTEE FROM information_schema.USER_PRIVILEGES
  UNION SELECT GRANTEE FROM information_schema.SCHEMA_PRIVILEGES
  UNION SELECT GRANTEE FROM information_schema.TABLE_PRIVILEGES
  UNION SELECT GRANTEE FROM information_schema.COLUMN_PRIVILEGES
) AS grantees
ORDER BY GRANTEE`

func (c *Conn) listUsersFromInformationSchema(ctx context.Context) ([]dbtypes.ServerUser, error) {
	seen := map[string]struct{}{}
	var out []dbtypes.ServerUser
	add := func(u dbtypes.ServerUser) {
		key := u.Name + "\x00" + u.Host
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		u.CanLogin = true
		out = append(out, u)
	}

	if u, ok, err := c.currentSessionUser(ctx); err != nil {
		return nil, err
	} else if ok {
		add(u)
	}

	rows, err := c.DB.QueryContext(ctx, listUsersFromInfoSchemaSQL)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var grantee string
		if err := rows.Scan(&grantee); err != nil {
			return out, err
		}
		name, host, ok := parseMySQLGrantee(grantee)
		if !ok {
			continue
		}
		add(dbtypes.ServerUser{Name: name, Host: host})
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	return out, nil
}

func (c *Conn) currentSessionUser(ctx context.Context) (dbtypes.ServerUser, bool, error) {
	var currentUser string
	if err := c.DB.QueryRowContext(ctx, "SELECT CURRENT_USER()").Scan(&currentUser); err != nil {
		return dbtypes.ServerUser{}, false, err
	}
	name, host, ok := parseMySQLAccount(currentUser)
	if !ok {
		return dbtypes.ServerUser{}, false, nil
	}
	return dbtypes.ServerUser{Name: name, Host: host}, true, nil
}

func scanServerUsers(rows *sql.Rows) ([]dbtypes.ServerUser, error) {
	var out []dbtypes.ServerUser
	for rows.Next() {
		var u dbtypes.ServerUser
		if err := rows.Scan(&u.Name, &u.Host); err != nil {
			return nil, err
		}
		u.CanLogin = true
		out = append(out, u)
	}
	return out, rows.Err()
}

// parseMySQLGrantee parses GRANTEE values like 'user'@'host'.
var reMySQLGrantee = regexp.MustCompile(`^'((?:''|[^'])*)'@'((?:''|[^'])*)'$`)

func parseMySQLGrantee(grantee string) (user, host string, ok bool) {
	m := reMySQLGrantee.FindStringSubmatch(strings.TrimSpace(grantee))
	if m == nil {
		return "", "", false
	}
	return unescapeMySQLString(m[1]), unescapeMySQLString(m[2]), true
}

// parseMySQLAccount parses CURRENT_USER() values like user@host (unquoted).
func parseMySQLAccount(account string) (user, host string, ok bool) {
	account = strings.TrimSpace(account)
	if account == "" {
		return "", "", false
	}
	if i := strings.LastIndex(account, "@"); i > 0 {
		return account[:i], account[i+1:], true
	}
	return account, "%", true
}

func unescapeMySQLString(s string) string {
	return strings.ReplaceAll(s, "''", "'")
}

func isMySQLPrivilegeError(err error) bool {
	var me *mysql.MySQLError
	if errors.As(err, &me) {
		switch me.Number {
		case 1044, 1142, 1143:
			return true
		}
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "command denied") || strings.Contains(msg, "access denied")
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
	host := req.Host
	if host == "" {
		host = "%"
	}
	stmts, err := maint.BuildCreateUserMySQL(req.Name, host, password)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for _, s := range stmts {
		if err := c.maintExec(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

func (c *Conn) DropUser(name, host string) error {
	if host == "" {
		host = "%"
	}
	sql, err := maint.BuildDropUserMySQL(name, host)
	if err != nil {
		return err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.maintExec(ctx, sql); err != nil {
		return err
	}
	return c.maintExec(ctx, "FLUSH PRIVILEGES")
}

var reShowGrant = regexp.MustCompile(`(?i)^GRANT\s+(.+?)\s+ON\s+` + "`?" + `([^` + "`" + `*]+)` + "`?" + `\.\*\s+TO`)

func (c *Conn) ListGrants(name, host string) ([]dbtypes.Grant, error) {
	if host == "" {
		host = "%"
	}
	acct := fmt.Sprintf("'%s'@'%s'", strings.ReplaceAll(name, "'", "''"), strings.ReplaceAll(host, "'", "''"))
	ctx, cancel := c.execCtx()
	defer cancel()
	rows, err := c.DB.QueryContext(ctx, "SHOW GRANTS FOR "+acct)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byDB := map[string]map[string]bool{}
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			return nil, err
		}
		m := reShowGrant.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		db := m[2]
		privs := strings.Split(m[1], ",")
		if byDB[db] == nil {
			byDB[db] = map[string]bool{}
		}
		for _, p := range privs {
			p = strings.TrimSpace(p)
			if p != "" {
				byDB[db][strings.ToUpper(p)] = true
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var out []dbtypes.Grant
	for db, privSet := range byDB {
		g := dbtypes.Grant{Database: db}
		for p := range privSet {
			g.Privileges = append(g.Privileges, p)
		}
		out = append(out, g)
	}
	return out, nil
}

func (c *Conn) ApplyGrants(req dbtypes.GrantRequest) error {
	host := req.Host
	if host == "" {
		host = "%"
	}
	var sql string
	var err error
	if req.Revoke {
		sql, err = maint.BuildRevokeMySQL(req.User, host, req.Database, req.Privileges)
	} else {
		sql, err = maint.BuildGrantMySQL(req.User, host, req.Database, req.Privileges)
	}
	if err != nil {
		return err
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.maintExec(ctx, sql); err != nil {
		return err
	}
	return c.maintExec(ctx, "FLUSH PRIVILEGES")
}

func (c *Conn) CreateDatabase(req dbtypes.CreateDatabaseRequest) error {
	sql, err := maint.BuildCreateDatabaseMySQL(req.Name, req.Charset, req.Collation)
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
	rows, err := c.DB.QueryContext(ctx, "SHOW CHARACTER SET")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.Charset
	for rows.Next() {
		var name, desc, defaultCollation, maxLen string
		if err := rows.Scan(&name, &desc, &defaultCollation, &maxLen); err != nil {
			return nil, err
		}
		out = append(out, dbtypes.Charset{
			Name:             name,
			DefaultCollation: defaultCollation,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Load collations per charset
	for i := range out {
		collRows, err := c.DB.QueryContext(ctx, "SHOW COLLATION WHERE Charset = ?", out[i].Name)
		if err != nil {
			continue
		}
		for collRows.Next() {
			var coll, charset, id, isDefault, sortLen, pad string
			if err := collRows.Scan(&coll, &charset, &id, &isDefault, &sortLen, &pad); err != nil {
				collRows.Close()
				break
			}
			out[i].Collations = append(out[i].Collations, coll)
		}
		collRows.Close()
	}
	return out, nil
}

func (c *Conn) ListActivity() ([]dbtypes.ServerProcess, error) {
	ctx, cancel := c.execCtx()
	defer cancel()
	query := `SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO
		FROM information_schema.PROCESSLIST
		ORDER BY TIME DESC`
	rows, err := c.DB.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.ServerProcess
	for rows.Next() {
		var p dbtypes.ServerProcess
		var id int64
		var db, state, info sql.NullString
		var timeSec int
		if err := rows.Scan(&id, &p.User, &p.Host, &db, &p.Command, &timeSec, &state, &info); err != nil {
			return nil, err
		}
		p.ID = strconv.FormatInt(id, 10)
		p.Database = db.String
		p.State = state.String
		p.Query = info.String
		p.TimeSec = timeSec
		out = append(out, p)
	}
	return out, rows.Err()
}

func (c *Conn) KillProcess(id string) error {
	if _, err := strconv.ParseInt(id, 10, 64); err != nil {
		return fmt.Errorf("invalid process id")
	}
	ctx, cancel := c.execCtx()
	defer cancel()
	if err := c.maintExec(ctx, "KILL QUERY "+id); err != nil {
		return c.maintExec(ctx, "KILL "+id)
	}
	return nil
}

func (c *Conn) ListLocks() ([]dbtypes.LockInfo, error) {
	ctx, cancel := c.execCtx()
	defer cancel()

	tryFuncs := []func(context.Context) ([]dbtypes.LockInfo, error){
		c.listLocksFromDataLockWaits,
		c.listLocksFromDataLocks,
		c.listLocksFromInnoDBLockWaits,
		c.listLocksFromInnoDBTrx,
	}

	var lastPrivErr error
	for _, fn := range tryFuncs {
		out, err := fn(ctx)
		if err == nil {
			return out, nil
		}
		if isMySQLPrivilegeError(err) {
			lastPrivErr = err
			continue
		}
		return nil, err
	}
	// Lock visibility requires elevated privileges; an empty list keeps Server Activity usable.
	_ = lastPrivErr
	return []dbtypes.LockInfo{}, nil
}

func (c *Conn) listLocksFromDataLockWaits(ctx context.Context) ([]dbtypes.LockInfo, error) {
	rows, err := c.DB.QueryContext(ctx, `SELECT
		'innodb_wait' AS lock_type,
		COALESCE(CAST(b.trx_mysql_thread_id AS CHAR), '') AS blocked_by,
		COALESCE(r.trx_query, '') AS blocked_query,
		COALESCE(TIMESTAMPDIFF(SECOND, r.trx_started, NOW()), 0) AS wait_sec
		FROM performance_schema.data_lock_waits w
		LEFT JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_engine_transaction_id
		LEFT JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_engine_transaction_id
		LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.LockInfo
	for rows.Next() {
		var li dbtypes.LockInfo
		var blockedBy, blockedQuery sql.NullString
		var waitSec sql.NullInt64
		if err := rows.Scan(&li.LockType, &blockedBy, &blockedQuery, &waitSec); err != nil {
			return nil, err
		}
		li.BlockedBy = blockedBy.String
		li.BlockedQuery = blockedQuery.String
		li.WaitSec = int(waitSec.Int64)
		out = append(out, li)
	}
	return out, rows.Err()
}

func (c *Conn) listLocksFromDataLocks(ctx context.Context) ([]dbtypes.LockInfo, error) {
	rows, err := c.DB.QueryContext(ctx, `SELECT lock_type, lock_mode, lock_status, lock_data
		FROM performance_schema.data_locks
		WHERE lock_status = 'WAITING'
		LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.LockInfo
	for rows.Next() {
		var li dbtypes.LockInfo
		var mode, status, data sql.NullString
		if err := rows.Scan(&li.LockType, &mode, &status, &data); err != nil {
			return nil, err
		}
		li.Table = data.String
		if mode.String != "" {
			li.Index = mode.String
		}
		out = append(out, li)
	}
	return out, rows.Err()
}

func (c *Conn) listLocksFromInnoDBLockWaits(ctx context.Context) ([]dbtypes.LockInfo, error) {
	rows, err := c.DB.QueryContext(ctx, `SELECT
		'innodb_wait' AS lock_type,
		COALESCE(CAST(b.trx_mysql_thread_id AS CHAR), '') AS blocked_by,
		COALESCE(r.trx_query, '') AS blocked_query,
		TIMESTAMPDIFF(SECOND, r.trx_started, NOW()) AS wait_sec
		FROM information_schema.innodb_lock_waits w
		INNER JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_trx_id
		INNER JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_trx_id
		LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.LockInfo
	for rows.Next() {
		var li dbtypes.LockInfo
		var blockedBy, blockedQuery sql.NullString
		var waitSec sql.NullInt64
		if err := rows.Scan(&li.LockType, &blockedBy, &blockedQuery, &waitSec); err != nil {
			return nil, err
		}
		li.BlockedBy = blockedBy.String
		li.BlockedQuery = blockedQuery.String
		li.WaitSec = int(waitSec.Int64)
		out = append(out, li)
	}
	return out, rows.Err()
}

func (c *Conn) listLocksFromInnoDBTrx(ctx context.Context) ([]dbtypes.LockInfo, error) {
	rows, err := c.DB.QueryContext(ctx, `SELECT
		trx_state,
		COALESCE(CAST(trx_mysql_thread_id AS CHAR), ''),
		COALESCE(trx_query, ''),
		TIMESTAMPDIFF(SECOND, trx_started, NOW())
		FROM information_schema.innodb_trx
		ORDER BY trx_started
		LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbtypes.LockInfo
	for rows.Next() {
		var li dbtypes.LockInfo
		var state, threadID, query sql.NullString
		var waitSec sql.NullInt64
		if err := rows.Scan(&state, &threadID, &query, &waitSec); err != nil {
			return nil, err
		}
		li.LockType = state.String
		li.BlockedBy = threadID.String
		li.BlockedQuery = query.String
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
	if target == "" {
		return dbtypes.RawResult{}, fmt.Errorf("target table is required")
	}
	var query string
	switch op {
	case "OPTIMIZE":
		qt, err := qualifyMySQLTarget(target)
		if err != nil {
			return dbtypes.RawResult{}, err
		}
		query = "OPTIMIZE TABLE " + qt
	case "ANALYZE":
		qt, err := qualifyMySQLTarget(target)
		if err != nil {
			return dbtypes.RawResult{}, err
		}
		query = "ANALYZE TABLE " + qt
	default:
		return dbtypes.RawResult{}, fmt.Errorf("unsupported maintenance op %q", op)
	}
	return c.runMaintQuery(query)
}

func qualifyMySQLTarget(target string) (string, error) {
	if strings.Contains(target, ".") {
		parts := strings.SplitN(target, ".", 2)
		if err := sqlbuilder.ValidateIdentifier(parts[0]); err != nil {
			return "", err
		}
		if err := sqlbuilder.ValidateIdentifier(parts[1]); err != nil {
			return "", err
		}
		d := sqlbuilder.MySQLDialect{}
		return d.QuoteIdent(parts[0]) + "." + d.QuoteIdent(parts[1]), nil
	}
	if err := sqlbuilder.ValidateIdentifier(target); err != nil {
		return "", err
	}
	return sqlbuilder.MySQLDialect{}.QuoteIdent(target), nil
}

func (c *Conn) runMaintQuery(query string) (dbtypes.RawResult, error) {
	ctx, cancel := c.execCtx()
	defer cancel()
	start := time.Now()
	rows, err := c.DB.QueryContext(ctx, query)
	if err != nil {
		return dbtypes.RawResult{}, err
	}
	defer rows.Close()
	rs := ResultSet{SQL: query}
	if err := scanResult(rows, &rs); err != nil {
		return dbtypes.RawResult{}, err
	}
	return dbtypes.RawResult{
		IsQuery:    true,
		ResultSet:  &rs,
		DurationMs: int(time.Since(start).Milliseconds()),
		Status:     "ok",
	}, nil
}
