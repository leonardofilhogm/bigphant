package mysql

import (
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"
)

func TestQualifyMySQLTarget(t *testing.T) {
	got, err := qualifyMySQLTarget("mydb.users")
	if err != nil {
		t.Fatal(err)
	}
	if got != "`mydb`.`users`" {
		t.Fatalf("got %q", got)
	}
	got, err = qualifyMySQLTarget("users")
	if err != nil {
		t.Fatal(err)
	}
	if got != "`users`" {
		t.Fatalf("got %q", got)
	}
}

func TestParseShowGrantLine(t *testing.T) {
	line := "GRANT SELECT, INSERT ON `mydb`.* TO 'app'@'%'"
	m := reShowGrant.FindStringSubmatch(line)
	if m == nil {
		t.Fatal("no match")
	}
	if m[2] != "mydb" {
		t.Fatalf("db=%q", m[2])
	}
	if !strings.Contains(m[1], "SELECT") {
		t.Fatalf("privs=%q", m[1])
	}
}

func TestParseMySQLGrantee(t *testing.T) {
	user, host, ok := parseMySQLGrantee(`'trato-dev'@'192.168.117.1'`)
	if !ok || user != "trato-dev" || host != "192.168.117.1" {
		t.Fatalf("got %q@%q ok=%v", user, host, ok)
	}
	user, host, ok = parseMySQLGrantee(`'o''brien'@'%'`)
	if !ok || user != "o'brien" || host != "%" {
		t.Fatalf("got %q@%q ok=%v", user, host, ok)
	}
}

func TestParseMySQLAccount(t *testing.T) {
	user, host, ok := parseMySQLAccount("trato-dev@192.168.117.1")
	if !ok || user != "trato-dev" || host != "192.168.117.1" {
		t.Fatalf("got %q@%q ok=%v", user, host, ok)
	}
}

func TestIsMySQLPrivilegeError(t *testing.T) {
	err := &mysql.MySQLError{Number: 1142, Message: "SELECT command denied"}
	if !isMySQLPrivilegeError(err) {
		t.Fatal("expected privilege error")
	}
}
