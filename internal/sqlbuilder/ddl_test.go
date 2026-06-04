package sqlbuilder

import "testing"

func TestBuildAlterTableMySQLAddColumn(t *testing.T) {
	req := AlterTableRequest{
		Database: "app",
		Table:    "users",
		Ops: []AlterOp{{
			Kind: "add_column",
			Column: &ColumnDef{
				Name:       "email",
				Type:       "VARCHAR(255)",
				Nullable:   false,
				HasDefault: true,
				Default:    "none",
			},
		}},
	}
	stmts, destructive, err := BuildAlterTable(MySQLDialect{}, req)
	if err != nil {
		t.Fatal(err)
	}
	if destructive {
		t.Fatal("add_column should not be destructive")
	}
	if len(stmts) != 1 {
		t.Fatalf("got %d stmts", len(stmts))
	}
	want := "ALTER TABLE `app`.`users` ADD COLUMN `email` VARCHAR(255) NOT NULL DEFAULT 'none'"
	if stmts[0] != want {
		t.Fatalf("got %q want %q", stmts[0], want)
	}
}

func TestBuildAlterTableMySQLDropColumn(t *testing.T) {
	req := AlterTableRequest{
		Database: "app",
		Table:    "users",
		Ops:      []AlterOp{{Kind: "drop_column", OldName: "legacy"}},
	}
	stmts, destructive, err := BuildAlterTable(MySQLDialect{}, req)
	if err != nil {
		t.Fatal(err)
	}
	if !destructive {
		t.Fatal("drop_column should be destructive")
	}
	if stmts[0] != "ALTER TABLE `app`.`users` DROP COLUMN `legacy`" {
		t.Fatalf("got %q", stmts[0])
	}
}

func TestBuildAlterTableRejectsInjection(t *testing.T) {
	req := AlterTableRequest{
		Table: "t",
		Ops: []AlterOp{{
			Kind:   "add_column",
			Column: &ColumnDef{Name: "x", Type: "INT; DROP TABLE users"},
		}},
	}
	_, _, err := BuildAlterTable(MySQLDialect{}, req)
	if err == nil {
		t.Fatal("expected error for injected type")
	}
}

func TestClassifyAlterModifyNotNull(t *testing.T) {
	req := AlterTableRequest{
		Ops: []AlterOp{{
			Kind:   "modify_column",
			Column: &ColumnDef{Name: "x", Type: "INT", Nullable: false},
		}},
	}
	if !ClassifyAlter(req) {
		t.Fatal("NOT NULL modify should be destructive")
	}
}

func TestBuildAlterTablePostgresRenameColumn(t *testing.T) {
	req := AlterTableRequest{
		Database: "public",
		Table:    "users",
		Ops:      []AlterOp{{Kind: "rename_column", OldName: "name", NewName: "full_name"}},
	}
	stmts, _, err := BuildAlterTable(PostgresDialect{}, req)
	if err != nil {
		t.Fatal(err)
	}
	want := `ALTER TABLE "public"."users" RENAME COLUMN "name" TO "full_name"`
	if stmts[0] != want {
		t.Fatalf("got %q want %q", stmts[0], want)
	}
}
