package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"bigphant/internal/connections"
)

// Conn wraps an open *sql.DB pool over a single SQLite file together with the
// metadata of the connection that owns it. One Conn corresponds to one window's
// active connection (docs/prd.md §5: one window = one connection pool).
type Conn struct {
	DB      *sql.DB
	Meta    connections.ConnectionMeta
	txMode  string // "auto_commit" | "explicit_commit"
	tx      *sql.Tx
	mu      sync.Mutex
	version string // e.g. "3.45.1"
	dbName  string // logical database name shown in the UI (file base name)
}

// dsn builds a modernc.org/sqlite file URI. The "file:" scheme is required for
// SQLite to interpret URI parameters such as mode=ro; the path is carried in
// url.URL.Path so it is percent-encoded (handles spaces and special characters).
// Read-only connections (the user's read-only flag or the AI Assistant's
// read-only pool) open the file with mode=ro and query_only so writes are
// rejected by the driver, not just by the app-layer guard. absPath must be
// absolute so the path is not mistaken for a URI authority.
func dsn(absPath string, readOnly bool) string {
	q := url.Values{}
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "foreign_keys(1)")
	if readOnly {
		q.Set("mode", "ro")
		q.Add("_pragma", "query_only(1)")
	}
	u := url.URL{Scheme: "file", Path: absPath, RawQuery: q.Encode()}
	return u.String()
}

// Open verifies the file exists, opens a pool, and pings it.
func Open(c connections.Connection) (*Conn, error) {
	path := strings.TrimSpace(c.FilePath)
	if path == "" {
		return nil, fmt.Errorf("a database file path is required for SQLite connections")
	}
	// An absolute path keeps the file: URI unambiguous (a relative path would be
	// mis-read as a URI authority).
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	// Refuse to silently create a new empty database when the user points at a
	// missing file — that is almost always a typo, not intent.
	if _, err := os.Stat(abs); err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("database file does not exist: %s", path)
		}
		return nil, err
	}

	db, err := sql.Open("sqlite", dsn(abs, c.ReadOnly))
	if err != nil {
		return nil, err
	}
	// SQLite serializes writers; a small pool with a busy timeout avoids
	// "database is locked" while still allowing concurrent readers.
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}

	version := detectVersion(db)
	return &Conn{
		DB:      db,
		Meta:    c.Meta(),
		txMode:  c.TransactionMode,
		version: version,
		dbName:  databaseName(path),
	}, nil
}

// Ping opens a throwaway pool, pings, and closes it — used by TestConnection.
func Ping(c connections.Connection) error {
	conn, err := Open(c)
	if err != nil {
		return err
	}
	return conn.Close()
}

// databaseName derives the logical database name shown in the UI from the file
// path (the base name without extension, e.g. "/data/app.db" → "app").
func databaseName(path string) string {
	base := filepath.Base(path)
	if ext := filepath.Ext(base); ext != "" {
		base = strings.TrimSuffix(base, ext)
	}
	if base == "" || base == "." {
		return "main"
	}
	return base
}

func detectVersion(db *sql.DB) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var v string
	if err := db.QueryRowContext(ctx, "SELECT sqlite_version()").Scan(&v); err != nil {
		return ""
	}
	return v
}

// Ping verifies the pool can reach the file.
func (c *Conn) Ping() error {
	if c == nil || c.DB == nil {
		return fmt.Errorf("no active connection")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return c.DB.PingContext(ctx)
}

func (c *Conn) Version() (string, error) { return c.version, nil }

func (c *Conn) Flavor() string { return "SQLite" }

// activeTx returns the open transaction, or nil (thread-safe).
func (c *Conn) activeTx() *sql.Tx {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.tx
}

func (c *Conn) SetTxMode(mode string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.txMode = mode
}

// ensureTx begins a transaction if the mode is explicit_commit and none is open.
func (c *Conn) ensureTx() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.txMode != "explicit_commit" || c.tx != nil {
		return nil
	}
	tx, err := c.DB.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	c.tx = tx
	return nil
}

func (c *Conn) Commit() error {
	c.mu.Lock()
	tx := c.tx
	c.tx = nil
	c.mu.Unlock()
	if tx == nil {
		return nil
	}
	return tx.Commit()
}

func (c *Conn) Rollback() error {
	c.mu.Lock()
	tx := c.tx
	c.tx = nil
	c.mu.Unlock()
	if tx == nil {
		return nil
	}
	return tx.Rollback()
}

func (c *Conn) Close() error {
	if c == nil || c.DB == nil {
		return nil
	}
	c.Rollback() // best effort
	return c.DB.Close()
}
