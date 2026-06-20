package sqlbuilder

import (
	"strings"
	"testing"
)

func TestSQLiteDialect(t *testing.T) {
	d := SQLiteDialect{}
	if got := d.QuoteIdent(`we"ird`); got != `"we""ird"` {
		t.Fatalf("QuoteIdent = %q", got)
	}
	if got := d.Placeholder(3); got != "?" {
		t.Fatalf("Placeholder = %q", got)
	}
	// SQLite has no namespace: Qualified ignores the database and quotes the table.
	if got := d.Qualified("ignored", "users"); got != `"users"` {
		t.Fatalf("Qualified = %q", got)
	}
}

func TestSQLiteBuildSelectUsesQuestionPlaceholders(t *testing.T) {
	req := FetchRowsRequest{
		Database: "app",
		Table:    "users",
		Filters:  []Filter{{Column: "age", Comparator: ">", Value: "18"}},
		Limit:    10,
	}
	sql, args, err := BuildSelectDialect(SQLiteDialect{}, req)
	if err != nil {
		t.Fatal(err)
	}
	// No database qualification, double-quoted identifiers, "?" placeholder.
	if !strings.Contains(sql, `FROM "users"`) || strings.Contains(sql, `"app"."users"`) {
		t.Fatalf("unexpected FROM clause: %q", sql)
	}
	if !strings.Contains(sql, `"age" > ?`) {
		t.Fatalf("expected ? placeholder, got: %q", sql)
	}
	if len(args) != 1 {
		t.Fatalf("got %d args", len(args))
	}
}

func TestBuildAlterSQLiteAddColumn(t *testing.T) {
	req := AlterTableRequest{
		Database: "app",
		Table:    "users",
		Ops: []AlterOp{{
			Kind:   "add_column",
			Column: &ColumnDef{Name: "email", Type: "TEXT", Nullable: false},
		}},
	}
	stmts, destructive, err := BuildAlterTable(SQLiteDialect{}, req)
	if err != nil {
		t.Fatal(err)
	}
	if destructive {
		t.Fatal("add_column should not be destructive")
	}
	want := `ALTER TABLE "users" ADD COLUMN "email" TEXT NOT NULL`
	if len(stmts) != 1 || stmts[0] != want {
		t.Fatalf("got %v want %q", stmts, want)
	}
}

func TestBuildAlterSQLiteRenameAndDrop(t *testing.T) {
	cases := []struct {
		op   AlterOp
		want string
	}{
		{AlterOp{Kind: "rename_table", NewName: "members"}, `ALTER TABLE "users" RENAME TO "members"`},
		{AlterOp{Kind: "rename_column", OldName: "name", NewName: "full_name"}, `ALTER TABLE "users" RENAME COLUMN "name" TO "full_name"`},
		{AlterOp{Kind: "drop_column", OldName: "legacy"}, `ALTER TABLE "users" DROP COLUMN "legacy"`},
	}
	for _, tc := range cases {
		stmts, _, err := BuildAlterTable(SQLiteDialect{}, AlterTableRequest{Table: "users", Ops: []AlterOp{tc.op}})
		if err != nil {
			t.Fatalf("%s: %v", tc.op.Kind, err)
		}
		if len(stmts) != 1 || stmts[0] != tc.want {
			t.Fatalf("%s: got %v want %q", tc.op.Kind, stmts, tc.want)
		}
	}
}

func TestBuildAlterSQLiteIndex(t *testing.T) {
	req := AlterTableRequest{
		Table: "users",
		Ops: []AlterOp{{
			Kind:  "add_unique",
			Index: &IndexDef{Name: "uq_email", Columns: []string{"email"}},
		}},
	}
	stmts, _, err := BuildAlterTable(SQLiteDialect{}, req)
	if err != nil {
		t.Fatal(err)
	}
	want := `CREATE UNIQUE INDEX "uq_email" ON "users" ("email")`
	if len(stmts) != 1 || stmts[0] != want {
		t.Fatalf("got %v want %q", stmts, want)
	}
}

func TestBuildAlterSQLiteRejectsUnsupported(t *testing.T) {
	unsupported := []string{
		"modify_column", "add_primary_key", "drop_primary_key",
		"add_foreign_key", "drop_foreign_key", "set_default", "drop_default",
		"add_check", "drop_constraint",
	}
	for _, kind := range unsupported {
		req := AlterTableRequest{
			Table: "users",
			Ops:   []AlterOp{{Kind: kind, Column: &ColumnDef{Name: "x", Type: "TEXT"}, Name: "c", OldName: "x"}},
		}
		_, _, err := BuildAlterTable(SQLiteDialect{}, req)
		if err == nil {
			t.Fatalf("%s: expected an unsupported-operation error", kind)
		}
		if !strings.Contains(err.Error(), "SQLite does not support") {
			t.Fatalf("%s: unexpected error %q", kind, err)
		}
	}
}

func TestBuildAlterSQLiteRejectsInjection(t *testing.T) {
	req := AlterTableRequest{
		Table: "t",
		Ops: []AlterOp{{
			Kind:   "add_column",
			Column: &ColumnDef{Name: "x", Type: "TEXT; DROP TABLE users"},
		}},
	}
	if _, _, err := BuildAlterTable(SQLiteDialect{}, req); err == nil {
		t.Fatal("expected error for injected type")
	}
}
