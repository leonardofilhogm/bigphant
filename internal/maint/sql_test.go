package maint

import (
	"strings"
	"testing"
)

func TestValidateIdentifierRejectsInjection(t *testing.T) {
	_, err := BuildGrantMySQL("admin", "%", "db; DROP TABLE users", []string{"SELECT"})
	if err == nil {
		t.Fatal("expected error for injected database name")
	}
}

func TestBuildCreateUserMySQL(t *testing.T) {
	stmts, err := BuildCreateUserMySQL("appuser", "localhost", "secret123")
	if err != nil {
		t.Fatal(err)
	}
	if len(stmts) != 3 {
		t.Fatalf("got %d stmts", len(stmts))
	}
	if !strings.Contains(stmts[0], "'appuser'@'localhost'") {
		t.Fatalf("unexpected stmt: %s", stmts[0])
	}
}

func TestBuildCreateDatabasePostgres(t *testing.T) {
	sql, err := BuildCreateDatabasePostgres("mydb", "UTF8", "postgres")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sql, `CREATE DATABASE "mydb"`) {
		t.Fatalf("unexpected: %s", sql)
	}
	if !strings.Contains(sql, `ENCODING 'UTF8'`) {
		t.Fatalf("unexpected: %s", sql)
	}
}

func TestBuildGrantPostgresSchema(t *testing.T) {
	sql, err := BuildGrantPostgresSchema("reader", "public", []string{"SELECT"})
	if err != nil {
		t.Fatal(err)
	}
	want := `GRANT SELECT ON ALL TABLES IN SCHEMA "public" TO "reader"`
	if sql != want {
		t.Fatalf("got %q want %q", sql, want)
	}
}
