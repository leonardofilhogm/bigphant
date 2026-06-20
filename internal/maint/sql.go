package maint

import (
	"fmt"
	"regexp"
	"strings"

	"bigphant/internal/sqlbuilder"
)

// MySQL user account quoting: 'user'@'host'
func quoteMySQLAccount(user, host string) (string, error) {
	if err := sqlbuilder.ValidateIdentifier(user); err != nil {
		return "", fmt.Errorf("user: %w", err)
	}
	host = strings.TrimSpace(host)
	if host == "" {
		host = "%"
	}
	if strings.Contains(host, ";") || strings.Contains(host, "--") || strings.Contains(host, "'") {
		return "", fmt.Errorf("invalid host")
	}
	return sqlbuilder.QuoteStringLiteral(user) + "@" + sqlbuilder.QuoteStringLiteral(host), nil
}

// BuildCreateUserMySQL returns CREATE USER and optional FLUSH PRIVILEGES follow-up.
func BuildCreateUserMySQL(user, host, password string) ([]string, error) {
	acct, err := quoteMySQLAccount(user, host)
	if err != nil {
		return nil, err
	}
	if password == "" {
		return nil, fmt.Errorf("password is required")
	}
	if strings.Contains(password, "'") || strings.Contains(password, "\\") {
		return nil, fmt.Errorf("invalid password characters")
	}
	stmts := []string{
		fmt.Sprintf("CREATE USER IF NOT EXISTS %s IDENTIFIED BY %s", acct, sqlbuilder.QuoteStringLiteral(password)),
		fmt.Sprintf("ALTER USER %s IDENTIFIED BY %s", acct, sqlbuilder.QuoteStringLiteral(password)),
		"FLUSH PRIVILEGES",
	}
	return stmts, nil
}

// BuildDropUserMySQL returns DROP USER statement.
func BuildDropUserMySQL(user, host string) (string, error) {
	acct, err := quoteMySQLAccount(user, host)
	if err != nil {
		return "", err
	}
	return "DROP USER IF EXISTS " + acct, nil
}

// BuildGrantMySQL builds GRANT … ON db.* TO user@host.
func BuildGrantMySQL(user, host, database string, privileges []string) (string, error) {
	acct, err := quoteMySQLAccount(user, host)
	if err != nil {
		return "", err
	}
	if err := sqlbuilder.ValidateIdentifier(database); err != nil {
		return "", fmt.Errorf("database: %w", err)
	}
	privs, err := validatePrivileges(privileges)
	if err != nil {
		return "", err
	}
	d := sqlbuilder.MySQLDialect{}
	return fmt.Sprintf("GRANT %s ON %s.* TO %s", strings.Join(privs, ", "), d.QuoteIdent(database), acct), nil
}

// BuildRevokeMySQL builds REVOKE … ON db.* FROM user@host.
func BuildRevokeMySQL(user, host, database string, privileges []string) (string, error) {
	acct, err := quoteMySQLAccount(user, host)
	if err != nil {
		return "", err
	}
	if err := sqlbuilder.ValidateIdentifier(database); err != nil {
		return "", fmt.Errorf("database: %w", err)
	}
	privs, err := validatePrivileges(privileges)
	if err != nil {
		return "", err
	}
	d := sqlbuilder.MySQLDialect{}
	return fmt.Sprintf("REVOKE %s ON %s.* FROM %s", strings.Join(privs, ", "), d.QuoteIdent(database), acct), nil
}

// BuildCreateDatabaseMySQL builds CREATE DATABASE with charset/collation.
func BuildCreateDatabaseMySQL(name, charset, collation string) (string, error) {
	if err := sqlbuilder.ValidateIdentifier(name); err != nil {
		return "", err
	}
	d := sqlbuilder.MySQLDialect{}
	parts := []string{"CREATE DATABASE " + d.QuoteIdent(name)}
	if charset != "" {
		if err := validateCharsetToken(charset); err != nil {
			return "", err
		}
		parts = append(parts, "CHARACTER SET "+charset)
	}
	if collation != "" {
		if err := validateCharsetToken(collation); err != nil {
			return "", err
		}
		parts = append(parts, "COLLATE "+collation)
	}
	return strings.Join(parts, " "), nil
}

// BuildCreateUserPostgres builds CREATE ROLE … LOGIN PASSWORD.
func BuildCreateUserPostgres(name, password string, canLogin, isSuperuser bool) (string, error) {
	if err := sqlbuilder.ValidateIdentifier(name); err != nil {
		return "", err
	}
	if password == "" {
		return "", fmt.Errorf("password is required")
	}
	if strings.Contains(password, "'") {
		return "", fmt.Errorf("invalid password characters")
	}
	d := sqlbuilder.PostgresDialect{}
	opts := []string{}
	if canLogin {
		opts = append(opts, "LOGIN")
	} else {
		opts = append(opts, "NOLOGIN")
	}
	if isSuperuser {
		opts = append(opts, "SUPERUSER")
	} else {
		opts = append(opts, "NOSUPERUSER")
	}
	opts = append(opts, "PASSWORD "+sqlbuilder.QuoteStringLiteral(password))
	return fmt.Sprintf("CREATE ROLE %s %s", d.QuoteIdent(name), strings.Join(opts, " ")), nil
}

// BuildDropUserPostgres builds DROP ROLE.
func BuildDropUserPostgres(name string) (string, error) {
	if err := sqlbuilder.ValidateIdentifier(name); err != nil {
		return "", err
	}
	d := sqlbuilder.PostgresDialect{}
	return "DROP ROLE IF EXISTS " + d.QuoteIdent(name), nil
}

// BuildGrantPostgresDatabase builds GRANT … ON DATABASE.
func BuildGrantPostgresDatabase(role, database string, privileges []string) (string, error) {
	if err := sqlbuilder.ValidateIdentifier(role); err != nil {
		return "", err
	}
	if err := sqlbuilder.ValidateIdentifier(database); err != nil {
		return "", err
	}
	privs, err := validatePrivileges(privileges)
	if err != nil {
		return "", err
	}
	d := sqlbuilder.PostgresDialect{}
	return fmt.Sprintf("GRANT %s ON DATABASE %s TO %s", strings.Join(privs, ", "), d.QuoteIdent(database), d.QuoteIdent(role)), nil
}

// BuildRevokePostgresDatabase builds REVOKE … ON DATABASE.
func BuildRevokePostgresDatabase(role, database string, privileges []string) (string, error) {
	if err := sqlbuilder.ValidateIdentifier(role); err != nil {
		return "", err
	}
	if err := sqlbuilder.ValidateIdentifier(database); err != nil {
		return "", err
	}
	privs, err := validatePrivileges(privileges)
	if err != nil {
		return "", err
	}
	d := sqlbuilder.PostgresDialect{}
	return fmt.Sprintf("REVOKE %s ON DATABASE %s FROM %s", strings.Join(privs, ", "), d.QuoteIdent(database), d.QuoteIdent(role)), nil
}

// BuildGrantPostgresSchema builds GRANT … ON ALL TABLES IN SCHEMA.
func BuildGrantPostgresSchema(role, schema string, privileges []string) (string, error) {
	if err := sqlbuilder.ValidateIdentifier(role); err != nil {
		return "", err
	}
	if err := sqlbuilder.ValidateIdentifier(schema); err != nil {
		return "", err
	}
	privs, err := validatePrivileges(privileges)
	if err != nil {
		return "", err
	}
	d := sqlbuilder.PostgresDialect{}
	return fmt.Sprintf("GRANT %s ON ALL TABLES IN SCHEMA %s TO %s", strings.Join(privs, ", "), d.QuoteIdent(schema), d.QuoteIdent(role)), nil
}

// BuildRevokePostgresSchema builds REVOKE … ON ALL TABLES IN SCHEMA.
func BuildRevokePostgresSchema(role, schema string, privileges []string) (string, error) {
	if err := sqlbuilder.ValidateIdentifier(role); err != nil {
		return "", err
	}
	if err := sqlbuilder.ValidateIdentifier(schema); err != nil {
		return "", err
	}
	privs, err := validatePrivileges(privileges)
	if err != nil {
		return "", err
	}
	d := sqlbuilder.PostgresDialect{}
	return fmt.Sprintf("REVOKE %s ON ALL TABLES IN SCHEMA %s FROM %s", strings.Join(privs, ", "), d.QuoteIdent(schema), d.QuoteIdent(role)), nil
}

// BuildCreateDatabasePostgres builds CREATE DATABASE with encoding/owner.
func BuildCreateDatabasePostgres(name, encoding, owner string) (string, error) {
	if err := sqlbuilder.ValidateIdentifier(name); err != nil {
		return "", err
	}
	d := sqlbuilder.PostgresDialect{}
	parts := []string{"CREATE DATABASE " + d.QuoteIdent(name)}
	if encoding != "" {
		if err := validateCharsetToken(encoding); err != nil {
			return "", err
		}
		parts = append(parts, "ENCODING "+sqlbuilder.QuoteStringLiteral(encoding))
	}
	if owner != "" {
		if err := sqlbuilder.ValidateIdentifier(owner); err != nil {
			return "", err
		}
		parts = append(parts, "OWNER "+d.QuoteIdent(owner))
	}
	return strings.Join(parts, " "), nil
}

var allowedPrivileges = map[string]bool{
	"SELECT": true, "INSERT": true, "UPDATE": true, "DELETE": true,
	"CREATE": true, "DROP": true, "ALTER": true, "INDEX": true,
	"ALL": true, "ALL PRIVILEGES": true,
	"CONNECT": true, "TEMPORARY": true, "TEMP": true, "USAGE": true,
	"REFERENCES": true, "TRIGGER": true, "EXECUTE": true,
}

func validatePrivileges(privileges []string) ([]string, error) {
	if len(privileges) == 0 {
		return nil, fmt.Errorf("at least one privilege is required")
	}
	out := make([]string, len(privileges))
	for i, p := range privileges {
		up := strings.ToUpper(strings.TrimSpace(p))
		if !allowedPrivileges[up] {
			return nil, fmt.Errorf("invalid privilege: %q", p)
		}
		out[i] = up
	}
	return out, nil
}

var reCharsetToken = regexp.MustCompile(`^[\w\-]+$`)

func validateCharsetToken(tok string) error {
	tok = strings.TrimSpace(tok)
	if tok == "" {
		return fmt.Errorf("charset token is required")
	}
	if strings.Contains(tok, ";") || strings.Contains(tok, "--") || strings.Contains(tok, "'") {
		return fmt.Errorf("invalid charset token")
	}
	if !reCharsetToken.MatchString(tok) {
		return fmt.Errorf("invalid charset token: %q", tok)
	}
	return nil
}
