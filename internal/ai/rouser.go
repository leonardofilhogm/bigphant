package ai

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"
)

// ROUsername is the fixed login Bigphant provisions for read-only AI queries.
const ROUsername = "bigphant_ai"

// ExecFunc runs a provisioning statement against the user's database (on the
// main, write-capable connection). It must NOT be subject to the read-only
// guard — these are known, safe account-management statements.
type ExecFunc func(sql string) error

// randomPassword returns a URL-safe password (no quotes or backslashes, so it is
// safe to inline into a CREATE USER string literal).
func randomPassword() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// ProvisionROUser creates (or refreshes) a SELECT-only database user scoped to
// the given database and returns its credentials. flavor is "MySQL", "MariaDB",
// or "PostgreSQL". If exec returns an error (typically a privilege error on the
// main connection), the caller should fall back to app-layer read-only
// enforcement using the connection's own credentials.
func ProvisionROUser(flavor, database string, exec ExecFunc) (username, password string, err error) {
	// SQLite has no concept of database users — read-only access is enforced at
	// the app layer (and by opening the file with mode=ro). Signal that here so
	// the caller falls back to app_layer mode without running bogus DDL.
	if strings.EqualFold(flavor, "SQLite") {
		return "", "", fmt.Errorf("SQLite has no database users; using app-layer read-only enforcement")
	}
	password, err = randomPassword()
	if err != nil {
		return "", "", err
	}
	if strings.EqualFold(flavor, "PostgreSQL") {
		return ROUsername, password, provisionPostgres(database, password, exec)
	}
	return ROUsername, password, provisionMySQL(database, password, exec)
}

func provisionMySQL(database, password string, exec ExecFunc) error {
	db := strings.ReplaceAll(database, "`", "``")
	stmts := []string{
		fmt.Sprintf("CREATE USER IF NOT EXISTS '%s'@'%%' IDENTIFIED BY '%s'", ROUsername, password),
		// Ensure the password matches even if the user already existed.
		fmt.Sprintf("ALTER USER '%s'@'%%' IDENTIFIED BY '%s'", ROUsername, password),
		fmt.Sprintf("GRANT SELECT ON `%s`.* TO '%s'@'%%'", db, ROUsername),
		"FLUSH PRIVILEGES",
	}
	for _, s := range stmts {
		if err := exec(s); err != nil {
			return err
		}
	}
	return nil
}

func provisionPostgres(database, password string, exec ExecFunc) error {
	// CREATE ROLE has no IF NOT EXISTS; if the role already exists, fall back to
	// ALTER ROLE to (re)set its password.
	createErr := exec(fmt.Sprintf("CREATE ROLE %s LOGIN PASSWORD '%s'", ROUsername, password))
	if createErr != nil {
		if !strings.Contains(strings.ToLower(createErr.Error()), "already exists") {
			return createErr
		}
		if err := exec(fmt.Sprintf("ALTER ROLE %s WITH LOGIN PASSWORD '%s'", ROUsername, password)); err != nil {
			return err
		}
	}
	db := pgQuoteIdent(database)
	stmts := []string{
		fmt.Sprintf("GRANT CONNECT ON DATABASE %s TO %s", db, ROUsername),
		fmt.Sprintf("GRANT USAGE ON SCHEMA public TO %s", ROUsername),
		fmt.Sprintf("GRANT SELECT ON ALL TABLES IN SCHEMA public TO %s", ROUsername),
		fmt.Sprintf("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %s", ROUsername),
	}
	for _, s := range stmts {
		if err := exec(s); err != nil {
			return err
		}
	}
	return nil
}

func pgQuoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}
