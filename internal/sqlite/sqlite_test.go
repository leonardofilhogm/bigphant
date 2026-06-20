package sqlite

import (
	"os"
	"path/filepath"
	"testing"

	"bigphant/internal/connections"
	"bigphant/internal/sqlbuilder"
)

// newTestConn creates an empty SQLite file and opens a writable engine over it.
func newTestConn(t *testing.T, readOnly bool) *Conn {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	// An empty file is a valid (empty) SQLite database; create it so Open's
	// existence check passes.
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	f.Close()

	conn, err := Open(connections.Connection{Driver: "sqlite", FilePath: path, ReadOnly: readOnly})
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func TestOpenMissingFile(t *testing.T) {
	_, err := Open(connections.Connection{Driver: "sqlite", FilePath: filepath.Join(t.TempDir(), "nope.db")})
	if err == nil {
		t.Fatal("expected an error for a missing file")
	}
}

func TestOpenRequiresPath(t *testing.T) {
	if _, err := Open(connections.Connection{Driver: "sqlite"}); err == nil {
		t.Fatal("expected an error for a blank file path")
	}
}

func TestSmokeCRUDAndIntrospection(t *testing.T) {
	c := newTestConn(t, false)

	if c.Flavor() != "SQLite" {
		t.Fatalf("Flavor = %q", c.Flavor())
	}
	if v, _ := c.Version(); v == "" {
		t.Fatal("expected a non-empty version")
	}

	mustExec(t, c, `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER)`)
	mustExec(t, c, `CREATE UNIQUE INDEX uq_users_name ON users (name)`)

	// ListDatabases returns one logical database; ListSchemas is empty.
	dbs, err := c.ListDatabases()
	if err != nil || len(dbs) != 1 {
		t.Fatalf("ListDatabases = %v, %v", dbs, err)
	}
	if schemas, _ := c.ListSchemas(""); len(schemas) != 0 {
		t.Fatalf("ListSchemas should be empty, got %v", schemas)
	}

	tables, err := c.ListTables("")
	if err != nil || len(tables) != 1 || tables[0].Name != "users" {
		t.Fatalf("ListTables = %v, %v", tables, err)
	}

	// InsertRow + FetchRows round trip.
	if _, err := c.InsertRow("", "users", map[string]any{"name": "Ada", "age": int64(36)}); err != nil {
		t.Fatalf("InsertRow: %v", err)
	}
	rs, err := c.FetchRows(sqlbuilder.FetchRowsRequest{Table: "users", Limit: 10})
	if err != nil || rs.RowCount != 1 {
		t.Fatalf("FetchRows = %+v, %v", rs, err)
	}

	// DescribeTable reports the primary key and the unique index.
	ts, err := c.DescribeTable("", "users")
	if err != nil {
		t.Fatalf("DescribeTable: %v", err)
	}
	if len(ts.PrimaryKey) != 1 || ts.PrimaryKey[0] != "id" {
		t.Fatalf("PrimaryKey = %v", ts.PrimaryKey)
	}
	if len(ts.Columns) != 3 {
		t.Fatalf("expected 3 columns, got %d", len(ts.Columns))
	}
	foundUnique := false
	for _, idx := range ts.Indexes {
		if idx.Name == "uq_users_name" && idx.Unique {
			foundUnique = true
		}
	}
	if !foundUnique {
		t.Fatalf("unique index not reported: %+v", ts.Indexes)
	}

	// SchemaColumns backs autocomplete.
	cols, err := c.SchemaColumns("")
	if err != nil || len(cols["users"]) != 3 {
		t.Fatalf("SchemaColumns = %v, %v", cols, err)
	}
}

func TestReadOnlyRejectsWrites(t *testing.T) {
	// Seed a table with a writable connection first.
	path := filepath.Join(t.TempDir(), "ro.db")
	f, _ := os.Create(path)
	f.Close()
	rw, err := Open(connections.Connection{Driver: "sqlite", FilePath: path})
	if err != nil {
		t.Fatal(err)
	}
	mustExec(t, rw, `CREATE TABLE t (id INTEGER)`)
	rw.Close()

	// Reopen read-only and confirm writes are rejected by the app-layer guard.
	ro, err := Open(connections.Connection{Driver: "sqlite", FilePath: path, ReadOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ro.Close() })

	if _, err := ro.InsertRow("", "t", map[string]any{"id": int64(1)}); err == nil {
		t.Fatal("expected InsertRow to be rejected on a read-only connection")
	}
	// A SELECT still works.
	if _, err := ro.FetchRows(sqlbuilder.FetchRowsRequest{Table: "t", Limit: 1}); err != nil {
		t.Fatalf("read-only SELECT should succeed: %v", err)
	}
}

func mustExec(t *testing.T, c *Conn, sql string) {
	t.Helper()
	res, err := c.ExecuteRaw(sql, "", false, false)
	if err != nil {
		t.Fatalf("ExecuteRaw(%q): %v", sql, err)
	}
	if res.Status != "ok" {
		t.Fatalf("ExecuteRaw(%q) status = %q", sql, res.Status)
	}
}
