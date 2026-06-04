package mysql

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"strconv"
	"sync"
	"time"

	"bigphant/internal/connections"

	"github.com/go-sql-driver/mysql"
)

// Conn wraps an open *sql.DB pool together with the metadata of the connection
// that owns it. One Conn corresponds to one window's active connection
// (docs/prd.md §5: one window = one connection pool).
type Conn struct {
	DB      *sql.DB
	Meta    connections.ConnectionMeta
	txMode  string // "auto_commit" | "explicit_commit"
	tx      *sql.Tx
	mu      sync.Mutex
	flavor  string // "MySQL" | "MariaDB"
	version string // clean numeric version, e.g. "8.0.36" or "11.4.2"
}

// mysqlConfig builds a mysql.Config used to open a connector. We avoid
// FormatDSN + sql.Open because go-sql-driver writes the password into the DSN
// string without escaping reserved characters (`%`, `@`, `:`, `/`), so any of
// those in a real password get mis-parsed back out. Using NewConnector keeps
// the credentials in Go memory and skips DSN parsing entirely.
func mysqlConfig(c connections.Connection) *mysql.Config {
	cfg := mysql.NewConfig()
	cfg.User = c.Username
	cfg.Passwd = c.Password
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
	cfg.DBName = c.DefaultDatabase
	cfg.ParseTime = true
	cfg.Loc = time.Local
	cfg.InterpolateParams = false
	return cfg
}

// Open creates a connection pool and verifies it with a ping.
func Open(c connections.Connection) (*Conn, error) {
	// TEMP DEBUG: confirm password bytes arrive intact at the driver. Remove
	// once the access-denied investigation closes.
	sum := sha256.Sum256([]byte(c.Password))
	log.Printf("[mysql.Open] user=%q host=%s:%d db=%q pwd_len=%d pwd_sha256_8=%s",
		c.Username, c.Host, c.Port, c.DefaultDatabase, len(c.Password), hex.EncodeToString(sum[:4]))

	connector, err := mysql.NewConnector(mysqlConfig(c))
	if err != nil {
		return nil, err
	}
	db := sql.OpenDB(connector)
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	flavor, version := detectFlavor(db)
	return &Conn{DB: db, Meta: c.Meta(), txMode: c.TransactionMode, flavor: flavor, version: version}, nil
}

// Ping verifies the pool can reach the server.
func (c *Conn) Ping() error {
	if c == nil || c.DB == nil {
		return fmt.Errorf("no active connection")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return c.DB.PingContext(ctx)
}

// Ping opens a throwaway pool, pings, and closes it — used by TestConnection.
func Ping(c connections.Connection) error {
	conn, err := Open(c)
	if err != nil {
		return err
	}
	return conn.DB.Close()
}

// activeTx returns the open transaction, or nil (thread-safe).
func (c *Conn) activeTx() *sql.Tx {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.tx
}

// SetTxMode updates the transaction mode at runtime (called when AppSettings
// change so the conn stays in sync with the global setting).
func (c *Conn) SetTxMode(mode string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.txMode = mode
}

// ensureTx begins a transaction if the mode is explicit_commit and none is open.
// Must be called before any mutation so the work lands inside the transaction.
// BeginTx intentionally uses context.Background so the transaction lifetime is
// not tied to the individual statement's timeout context.
func (c *Conn) ensureTx(_ context.Context) error {
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

// Commit commits the active transaction.
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

// Rollback rolls back the active transaction.
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

// Close rolls back any open transaction then releases the pool.
func (c *Conn) Close() error {
	if c == nil || c.DB == nil {
		return nil
	}
	c.Rollback() //nolint — best effort
	return c.DB.Close()
}
