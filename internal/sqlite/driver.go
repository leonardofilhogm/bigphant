// Package sqlite is the single gateway for all SQLite access, mirroring the
// internal/mysql and internal/postgres connectors (see docs/prd.md §5). The
// frontend never opens connections or builds SQL directly; everything goes
// through this package and internal/sqlbuilder.
//
// SQLite differs from the networked engines in ways this package handles:
//   - a connection is a local file path, not host/port/user/password;
//   - there is no database/schema namespace — one file is one database, so the
//     database argument threaded through the engine interface is cosmetic;
//   - there is no SSH tunnel (the file is local);
//   - ALTER TABLE is limited (see internal/sqlbuilder buildAlterSQLite).
package sqlite

// Register the pure-Go SQLite driver with database/sql under the name "sqlite".
// Pure Go (no CGO) keeps `wails build -platform darwin/universal` working without
// a C toolchain.
import _ "modernc.org/sqlite"
