package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"

	"bigphant/internal/connections"
	"bigphant/internal/sshtunnel"
)

// Conn wraps an open *sql.DB pool together with the metadata of the connection
// that owns it. For Postgres, the connection is pinned to a single database
// (connections.Connection.DefaultDatabase).
type Conn struct {
	DB      *sql.DB
	Meta    connections.ConnectionMeta
	txMode  string // "auto_commit" | "explicit_commit"
	tx      *sql.Tx
	mu      sync.Mutex
	version string // e.g. "16.2"

	tunnel        *sshtunnel.Tunnel
	registeredDSN string // non-empty when opened via a registered pgx ConnConfig (SSH tunnel)
}

func dsn(c connections.Connection, sslmode string) (string, error) {
	if c.DefaultDatabase == "" {
		// PostgreSQL requires a database; default to "postgres" if not set.
		c.DefaultDatabase = "postgres"
	}
	u := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(c.Username, c.Password),
		Host:   net.JoinHostPort(c.Host, strconv.Itoa(c.Port)),
		Path:   "/" + c.DefaultDatabase,
	}
	q := u.Query()
	if sslmode == "" {
		sslmode = "prefer"
	}
	q.Set("sslmode", sslmode)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// Open creates a connection pool and verifies it with a ping.
func Open(c connections.Connection, sslmode string) (*Conn, error) {
	dsnStr, err := dsn(c, sslmode)
	if err != nil {
		return nil, err
	}

	var (
		db            *sql.DB
		tunnel        *sshtunnel.Tunnel
		registeredDSN string
	)
	if c.SSHEnabled {
		// Tunnel pgx's TCP dial through SSH. pgx can't take a DialFunc from a
		// plain DSN, so we register a ConnConfig and open via the returned
		// handle; the registration is released in Conn.Close.
		t, err := sshtunnel.Open(c)
		if err != nil {
			return nil, err
		}
		connConfig, err := pgx.ParseConfig(dsnStr)
		if err != nil {
			t.Close()
			return nil, err
		}
		connConfig.DialFunc = t.DialContext
		registeredDSN = stdlib.RegisterConnConfig(connConfig)
		db, err = sql.Open("pgx", registeredDSN)
		if err != nil {
			stdlib.UnregisterConnConfig(registeredDSN)
			t.Close()
			return nil, err
		}
		tunnel = t
	} else {
		db, err = sql.Open("pgx", dsnStr)
		if err != nil {
			return nil, err
		}
	}

	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		if registeredDSN != "" {
			stdlib.UnregisterConnConfig(registeredDSN)
		}
		tunnel.Close()
		return nil, err
	}

	version := detectVersion(db)
	return &Conn{DB: db, Meta: c.Meta(), txMode: c.TransactionMode, version: version, tunnel: tunnel, registeredDSN: registeredDSN}, nil
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
	err := c.DB.Close()
	if c.registeredDSN != "" {
		stdlib.UnregisterConnConfig(c.registeredDSN)
	}
	if c.tunnel != nil {
		c.tunnel.Close()
	}
	return err
}

func (c *Conn) Version() (string, error) { return c.version, nil }

func (c *Conn) Flavor() string { return "PostgreSQL" }
