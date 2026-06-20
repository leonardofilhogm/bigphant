package postgres

import "testing"

func TestIsDatabasePriv(t *testing.T) {
	if !isDatabasePriv([]string{"CONNECT"}) {
		t.Fatal("CONNECT should be database priv")
	}
	if isDatabasePriv([]string{"SELECT"}) {
		t.Fatal("SELECT is not database priv")
	}
}
