// Package mysql is the single gateway for all MySQL access (see docs/prd.md §5).
// The frontend never opens connections or builds SQL directly; everything goes
// through this package and internal/sqlbuilder.
package mysql

// Register the MySQL driver with database/sql. Imported for its side effects so
// that sql.Open("mysql", ...) works throughout the package.
import _ "github.com/go-sql-driver/mysql"
