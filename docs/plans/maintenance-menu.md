# Maintenance menu — server administration (users, databases, activity)

## Context

Bigphant currently browses and edits data but offers no **server administration**.
The user wants a native top-bar **"Maintenance"** menu (macOS/Windows) to manage the
connected server, modeled on TablePlus:

1. **Users & Permissions** — create/drop users (MySQL) / roles (Postgres) and edit
   per-database privileges via a checkbox matrix.
2. **Databases** — create a database choosing charset/collation (MySQL) or
   encoding/owner (Postgres).
3. **Server Activity / debugging** — list running queries, kill a query, view locks;
   plus cross-engine **Database Maintenance** (MySQL `OPTIMIZE/ANALYZE`, Postgres
   `VACUUM/ANALYZE`, SQLite `VACUUM`/integrity check/`REINDEX`).

**Scope expansion — read first.** PRD §4 explicitly lists *"DB create/delete from UI"*
as out of scope, and user management is not in Must/Should/Could. This epic
**consciously expands the PoC contract** (as Postgres, SSH, AI, and SQLite already
did). The plan updates `docs/prd.md` + `CLAUDE.md` to record it. Engine coverage:
**MySQL/MariaDB + PostgreSQL full**; **SQLite** gets only Database Maintenance (no
users, no multi-database) — those items are disabled for it.

## Architecture

Mirror the existing `app_ai.go` / `app_ddl.go` split: a new **`app_maint.go`** holds
the Wails methods; engine logic lives behind a new **optional capability interface**
so SQLite need not implement user/database management.

- **`internal/engine/engine.go`** — add a separate interface (not added to the
  mandatory `Engine`):
  ```go
  type MaintenanceEngine interface {
      ListUsers() ([]dbtypes.ServerUser, error)
      CreateUser(req dbtypes.CreateUserRequest) error
      DropUser(name, host string) error
      ListGrants(name, host string) ([]dbtypes.Grant, error)
      ApplyGrants(req dbtypes.GrantRequest) error
      CreateDatabase(req dbtypes.CreateDatabaseRequest) error
      ListCharsets() ([]dbtypes.Charset, error)
      ListActivity() ([]dbtypes.ServerProcess, error)
      KillProcess(id string) error
      ListLocks() ([]dbtypes.LockInfo, error)
      RunMaintenance(op string, target string) (dbtypes.RawResult, error) // VACUUM/ANALYZE/OPTIMIZE/integrity
      Capabilities() dbtypes.ServerCapabilities
  }
  ```
  `app_maint.go` methods type-assert `a.conn.(engine.MaintenanceEngine)` and return a
  friendly *"not supported by this engine"* `apperror` when the assertion fails.
- **DTOs** in `internal/dbtypes/types.go`: `ServerUser`, `Grant`, `GrantRequest`,
  `CreateUserRequest`, `CreateDatabaseRequest`, `Charset`, `ServerProcess`, `LockInfo`,
  `ServerCapabilities{ManageUsers, ManageDatabases, ViewActivity bool; MaintenanceOps []string}`.

### Per-engine implementations
- **`internal/mysql/maint.go`** — users via `SELECT user,host FROM mysql.user`,
  `CREATE USER`, `DROP USER`, `SHOW GRANTS`, `GRANT/REVOKE … ON db.* TO …`; databases via
  `CREATE DATABASE … CHARACTER SET … COLLATE …` + `SHOW CHARACTER SET`; activity via
  `information_schema.PROCESSLIST`, `KILL <id>`; locks via `sys.innodb_lock_waits`
  (fallback `performance_schema.data_locks`); maintenance `OPTIMIZE/ANALYZE TABLE`.
- **`internal/postgres/maint.go`** — roles via `pg_roles`, `CREATE ROLE … LOGIN PASSWORD`,
  `DROP ROLE`, grants via `GRANT … ON DATABASE`/`ON ALL TABLES IN SCHEMA`; databases via
  `CREATE DATABASE … ENCODING … OWNER …` + `pg_encoding`; activity via `pg_stat_activity`,
  `pg_terminate_backend(pid)`; locks via `pg_locks` ⋈ `pg_stat_activity`; maintenance
  `VACUUM`/`ANALYZE`.
- **`internal/sqlite/maint.go`** — implements only `Capabilities()` (users/databases/
  activity = false) and `RunMaintenance` (`VACUUM`, `PRAGMA integrity_check`, `REINDEX`);
  all other methods return the not-supported error.

### Reuse (do not reinvent)
- **`internal/ai/rouser.go`** is the precedent for safe account-provisioning SQL —
  `randomPassword()`, identifier quoting, MySQL `CREATE USER … IDENTIFIED BY` and
  Postgres `CREATE ROLE … LOGIN PASSWORD`. Factor its quoting helpers (or copy the
  pattern) for the user-management SQL.
- **`sqlbuilder.Dialect.QuoteIdent` + `quoteStringLiteral`** for all identifier/literal
  interpolation — DDL identifiers can't be bound parameters, so this is the safety
  boundary. Add a strict identifier validator (reuse the `validateTypeToken` regex
  approach in `internal/sqlbuilder/ddl.go`).
- **`a.gateLicense(a.licenseSvc.Require(license.FeatModifySchema))`** (app_ddl.go:40) to
  gate every write (create user/db, grant, kill, maintenance) — admin ops are Pro-only.
- **`apperror`** shape for verbatim server errors; **`dbtypes.RawResult`** for op results.

## Native menu (`menu.go`)
Add a `Maintenance` submenu after `Connections`, before `WindowMenu`:
```
Maintenance
  ├─ Manage Users & Permissions…   → emit "menu:maint-users"
  ├─ Create Database…              → emit "menu:maint-database"
  ├─ Server Activity…              → emit "menu:maint-activity"
  └─ Database Maintenance…         → emit "menu:maint-tools"
```
Items always emit; engine-gating happens in the dialogs (capability check), avoiding
per-tab native-menu rebuilds. (Optional later: rebuild the menu on active-connection
change to grey out unsupported items, using the existing
`runtime.MenuSetApplicationMenu` call in `app.go:76`.)

## Frontend
- **`Workspace.tsx`** — extend the `useMenuEvents` map (around line 472) with the four
  `menu:maint-*` events, each toggling a dialog `open` state; render the new dialogs
  near the existing `Settings`/`OpenConnectionDialog` block (~line 825).
- **New components** under `frontend/src/components/maintenance/`:
  - `UserManager.tsx` — list users, create/drop, and a **per-database privilege
    checkbox matrix** (SELECT/INSERT/UPDATE/DELETE/CREATE/DROP/ALTER/INDEX/ALL),
    host field (MySQL) / role attributes (Postgres).
  - `DatabaseCreator.tsx` — name + charset/collation (MySQL) or encoding/owner (Postgres)
    selectors populated from `ListCharsets`.
  - `ServerActivity.tsx` — reuse **`DataGrid`** for the process list + a Locks tab; a
    "Kill" action per row with a confirm dialog.
  - `MaintenanceTools.tsx` — engine-aware op buttons (VACUUM/ANALYZE/OPTIMIZE/integrity).
  - Each dialog calls `api.serverCapabilities()` on open and shows a friendly
    "not available for SQLite/this engine" state when unsupported.
- **`lib/api.ts`** + **`lib/types.ts`** — thin wrappers and mirrored DTOs; Wails bindings
  regenerate via `wails generate module`.
- Reuse the **Settings `Row` pattern** and existing shadcn `Dialog`, `Switch`,
  `Checkbox`, `Select`, `Badge`, and the destructive-confirm pattern used by Delete
  Connection.

## Safety & security
- All write paths gated by `FeatModifySchema` **and** an explicit frontend confirm for
  destructive actions (drop user, kill query, VACUUM FULL-style).
- Identifiers/passwords are quoted+validated server-side; **never `fmt.Sprintf` raw user
  input into admin SQL** (same rule as the rest of the app). Passwords for new users are
  never echoed back to the frontend.
- `KillProcess` and grant changes surface the server error verbatim via `apperror`.

## Docs
Update `docs/prd.md` (new "Maintenance / server administration" section) and `CLAUDE.md`
(note the menu, the `MaintenanceEngine` capability interface, the `FeatModifySchema`
gate, and that this supersedes the PRD §4 "no DB create/delete from UI" exclusion).

## Verification
1. `go build ./...`, `go test ./...`; add unit tests for the user/grant/database SQL
   builders (identifier quoting + injection rejection) in each `*_maint_test.go`.
2. `cd frontend && npx tsc --noEmit` clean; `npm run build` succeeds.
3. `wails dev` against a local **MySQL** and **Postgres**: create a user, grant
   per-database privileges, verify with `SHOW GRANTS` / `\du`; create a database with a
   non-default charset/encoding; open Server Activity, run a slow query in another
   client, see it listed and kill it; view locks; run Database Maintenance.
4. Open the menu on a **SQLite** connection: confirm user/database/activity items show
   the unsupported state and Database Maintenance runs `VACUUM`/integrity check.
5. Confirm every write is blocked on a Free license (gate) and that injection attempts
   in names/identifiers are rejected.
