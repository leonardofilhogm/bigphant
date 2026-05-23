package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"strconv"
	"time"

	"bigphant/internal/connections"
)

// Conn wraps an open *sql.DB pool together with the metadata of the connection
// that owns it. One Conn corresponds to one window's active connection
// (docs/prd.md §5: one window = one connection pool).
type Conn struct {
	DB   *sql.DB
	Meta connections.ConnectionMeta
}

// dsn builds a go-sql-driver/mysql DSN. parseTime maps DATE/DATETIME to
// time.Time so they JSON-encode as RFC3339 strings.
func dsn(c connections.Connection) string {
	addr := net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
	cfg := fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true&loc=Local&interpolateParams=false",
		c.Username, c.Password, addr, c.DefaultDatabase)
	return cfg
}

// Open creates a connection pool and verifies it with a ping.
func Open(c connections.Connection) (*Conn, error) {
	db, err := sql.Open("mysql", dsn(c))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return &Conn{DB: db, Meta: c.Meta()}, nil
}

// Ping opens a throwaway pool, pings, and closes it — used by TestConnection.
func Ping(c connections.Connection) error {
	conn, err := Open(c)
	if err != nil {
		return err
	}
	return conn.DB.Close()
}

// Close releases the pool.
func (c *Conn) Close() error {
	if c == nil || c.DB == nil {
		return nil
	}
	return c.DB.Close()
}
