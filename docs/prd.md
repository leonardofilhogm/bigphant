# Bigphant — PoC PRD & Build Plan

> **Project:** Bigphant
> **Version:** v0.1 (Proof of Concept)
> **Author:** [Owner]
> **Last Updated:** 2026-05-23
> **Status:** Draft — Ready for Implementation
> **Audience:** Claude Code (solo developer + AI coding agent)

---

## 1. Overview

**Feature:** Bigphant — a native macOS database client built with Go + React (Wails), inspired by TablePlus and Beekeeper Studio.

**Problem:** Existing GUI database clients are either heavyweight (DBeaver), expensive (TablePlus), or tied to a single engine (pgAdmin, phpMyAdmin). There is room for a fast, native, opinionated client — and eventually one that integrates LLM-based agentic workflows.

**Solution (this PoC):** Ship a single-engine (MySQL), single-OS (macOS), single-developer-built client that proves the core experience: connect to a MySQL server, browse databases and tables, run CRUD operations and raw queries, edit rows in a TablePlus-style panel, and export results. This PoC validates the technology stack (Wails + React + shadcn) and the UX direction before broadening to multi-engine and agentic features.

**Long-term Vision (NOT in PoC scope):** Multi-engine support (Postgres, SQLite, MSSQL) and an "agentic DB communicator" mode where an LLM can introspect schema, propose queries, and execute them under user supervision.

**Success Metrics (PoC):**
- Connect to a MySQL server (local or remote, no SSH) in under 5 seconds
- Browse a database with 50+ tables without UI lag
- Execute SELECT/INSERT/UPDATE/DELETE successfully against a real MySQL instance
- Distribute a working `.dmg` installer for Apple Silicon and Intel Macs
- Solo developer (the author) can complete the build in evenings/weekends with Claude Code's help

---

## 2. Implementation Context

```
Project name:    Bigphant
Repo layout:     Single monorepo (Wails default structure)
Backend:         Go 1.22+ (Wails v2)
Frontend:        React 18 + TypeScript + Vite
UI library:      shadcn/ui + Tailwind CSS
DB driver:       github.com/go-sql-driver/mysql
Target OS:       macOS only (Intel x86_64 + Apple Silicon arm64)
Distribution:    .dmg (signing/notarization deferred)
Tests:           Not required for PoC. Manual testing only.
                 Suggested but optional: Go unit tests for SQL builder and crypto.
Code style:      Use Wails default conventions; idiomatic Go; functional React components with hooks.
```

### Repo layout (Wails default)

```
bigphant/
├── app.go                      # Wails App struct, lifecycle hooks
├── main.go                     # Wails entrypoint
├── wails.json                  # Wails project config
├── go.mod / go.sum
├── internal/
│   ├── connections/            # connection profile storage (encrypted files)
│   ├── mysql/                  # MySQL driver wrapper, introspection, query exec
│   ├── sqlbuilder/             # safe SQL generation for CRUD
│   ├── crypto/                 # AES-GCM helpers for credential files
│   └── export/                 # CSV + SQL export
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/         # shadcn/ui components + app components
│   │   ├── pages/              # ConnectionList, Workspace, QueryEditor, etc.
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── wailsjs/            # auto-generated Wails bindings
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
└── build/
    └── darwin/                 # .dmg output + icons
```

---

## 3. PoC Scope — Expected Behaviour

### 3.1 Must Have (PoC is incomplete without these)

| #  | Criterion | Tag |
|----|-----------|-----|
| 1  | Given the user opens the app, When no connections exist, Then a "New Connection" screen is shown with fields: name, host, port (default 3306), username, password, default database (optional) | Must Have |
| 2  | Given the user fills in connection details and clicks "Test", When credentials are valid, Then a success toast is shown; on failure the MySQL error message is displayed verbatim | Must Have |
| 3  | Given the user saves a connection, When saved, Then it is written to an encrypted file at `~/Library/Application Support/Bigphant/connections/<uuid>.enc` (one file per connection) | Must Have |
| 4  | Given a saved connection exists, When the user double-clicks it, Then a new workspace window opens connected to that MySQL server | Must Have |
| 5  | Given multiple connections are open, When each is in its own window, Then they operate independently with no shared state beyond the connection list | Must Have |
| 6  | Given a workspace is open, When loaded, Then the sidebar lists all databases the user has access to (`SHOW DATABASES`) | Must Have |
| 7  | Given a database is selected, When loaded, Then all tables in that database are listed (`SHOW TABLES`) | Must Have |
| 8  | Given a table is clicked, When opened, Then its rows are displayed in a paginated grid with a default `LIMIT 300 OFFSET 0`, and the column headers reflect `DESCRIBE <table>` | Must Have |
| 9  | Given a table grid is shown, When the user clicks "Next page", Then the next 300 rows load (`OFFSET += 300`) | Must Have |
| 10 | Given a table grid is shown, When the user clicks a row once, Then a vertical edit panel slides in from the right showing every column stacked vertically with its value editable | Must Have |
| 11 | Given a table grid is shown, When the user double-clicks a cell, Then that cell becomes inline-editable; pressing Enter or Tab saves it (UPDATE by primary key) | Must Have |
| 12 | Given the user edits a row, When changes exist and they click "Save", Then an `UPDATE` is generated using the table's primary key in the WHERE clause | Must Have |
| 13 | Given the user clicks "Add row", When the user fills values and saves, Then an `INSERT` is executed | Must Have |
| 14 | Given the user selects rows and clicks "Delete", When confirmed via modal, Then `DELETE ... WHERE pk IN (...)` is executed | Must Have |
| 15 | Given the user runs a destructive operation (UPDATE/DELETE/TRUNCATE/DROP without a WHERE that targets a single row), When triggered, Then a blocking confirmation modal appears showing the SQL to be executed | Must Have |
| 16 | Given Settings has a "Allow destructive operations without WHERE" toggle, When it is OFF (default), Then UPDATE/DELETE without WHERE is blocked entirely (modal cannot be confirmed); When ON, the modal acts as a confirmation only | Must Have |
| 17 | Given a table is open, When the user opens the "Structure" tab, Then columns are listed with name, type, nullable, default, key, extra (from `DESCRIBE` or `INFORMATION_SCHEMA`) | Must Have |
| 18 | Given the structure view, When the user clicks "Add column" / "Edit column" / "Drop column", Then the corresponding `ALTER TABLE` is generated and previewed in a confirm modal before execution | Must Have |
| 19 | Given the user opens the database view, When loaded, Then it lists all tables with row counts (from `INFORMATION_SCHEMA.TABLES`) and storage engines | Must Have |
| 20 | Given a table grid is shown, When the user clicks "Filter", Then a filter UI appears: a row of {column dropdown, comparator dropdown (`=`, `!=`, `>`, `<`, `LIKE`, `IS NULL`, `IS NOT NULL`), value input}. Multiple filters AND together. | Must Have |
| 21 | Given filters are applied, When the user clicks "Apply", Then the table refetches with a `WHERE` clause built from the filters | Must Have |
| 22 | Given the user clicks the "Columns" button on a table grid, When a dropdown appears, Then they can toggle visibility of any column (visibility is local UI state; the SELECT still fetches all columns) | Must Have |
| 23 | Given the user opens the SQL Editor tab, When they enter a query and press Cmd+Enter, Then the query executes against the current connection and results appear in a results pane | Must Have |
| 24 | Given the SQL Editor, When the user opens a new tab (`+` button), Then a fresh editor opens; multiple editor tabs persist within the same workspace window for that session | Must Have |
| 25 | Given a result set is shown (from table view or SQL editor), When the user clicks "Export → CSV", Then the current result set (all loaded rows, with current column visibility) is exported to a `.csv` file via macOS save dialog | Must Have |
| 26 | Given a result set is shown, When the user clicks "Export → SQL", Then an INSERT-statement `.sql` file is generated containing the current result set | Must Have |
| 27 | Given a Settings panel exists, When opened, Then the user can configure: (a) destructive ops safety toggle, (b) transaction mode (auto-commit vs explicit-commit), (c) per-connection read-only flag | Must Have |
| 28 | Given a connection is flagged read-only, When any non-SELECT query is attempted, Then it is blocked with an explanatory error | Must Have |
| 29 | Given transaction mode is "explicit-commit", When any data-modifying query is executed, Then it runs inside a transaction and a "Commit / Rollback" bar appears until the user resolves it | Must Have |

### 3.2 Should Have (target for PoC but not blocking)

| #  | Criterion | Tag |
|----|-----------|-----|
| 30 | Given a JSON column, When displayed in the grid, Then it is shown collapsed with a "{...}" badge; clicking expands a pretty-printed view | Should Have |
| 31 | Given the app, When the user toggles dark mode in Settings, Then the UI switches between light/dark using shadcn theme tokens | Should Have |
| 32 | Given the user wants to import data, When they click "Import CSV" on a table, Then a file picker opens and rows are inserted (mapping picker for column alignment) | Should Have |
| 33 | Given the user runs a query in the SQL Editor, When it completes, Then the query is added to an in-memory history list for the session (not persisted across app restarts) | Should Have |
| 34 | Given a Wails window is open, When the user closes it, Then any open transaction in explicit-commit mode prompts to commit or rollback before close | Should Have |

### 3.3 Could Have (only if time allows)

| #  | Criterion | Tag |
|----|-----------|-----|
| 35 | Given the SQL Editor, When the user saves a query (Cmd+S), Then it is stored in a local JSON file and listed in a "Saved Queries" sidebar | Could Have |
| 36 | Given a long-running query, When executing, Then a "Cancel" button is available that calls `KILL QUERY` on the MySQL server | Could Have |

---

## 4. Out of Scope (Explicitly Deferred)

These are not part of the PoC. Do not implement them, even if they seem like natural extensions:

- Any database engine other than MySQL (Postgres, SQLite, MSSQL, MongoDB, etc.)
- Any OS other than macOS (no Windows or Linux builds)
- SSL/TLS connection options (will rely on driver defaults)
- Master password to unlock the app
- Foreign key navigation (click FK value → jump to referenced row)
- Keyboard shortcut customization / command palette
- Database diff / schema comparison
- `mysqldump`-based backup/restore
- Stored procedures, views, triggers, events management
- Database creation/deletion from UI *(superseded by §17 Maintenance menu — create is in scope; delete remains deferred)*
- Visual query builder with joins
- Bulk Login Code-style admin features
- Auto-update mechanism
- Code signing and notarization (DMG ships unsigned for PoC)
- Telemetry / analytics
- Authentication plugins beyond MySQL native + caching_sha2_password
- Agentic / LLM-assisted query features
- User accounts / multi-user / cloud sync of connections
- Internationalization (English-only)
- Persistent query history across app restarts
- Persistent saved queries (unless Could Have #35 is reached)
- Inline editing of JSON column values via a structured editor (plain text only)
- Schema editing beyond column add/edit/drop and index add/drop ("light" mode only)

---

## 5. Architectural Decisions & Restrictions

### Hard constraints

- **One window = one connection.** Each Wails window owns its own MySQL connection pool. No connection sharing across windows.
- **All MySQL access goes through `internal/mysql`.** Frontend never constructs SQL except in the raw SQL editor; all CRUD SQL is built by `internal/sqlbuilder` on the Go side.
- **Credentials are never sent to the frontend in cleartext.** The frontend gets connection metadata (name, host, port, username) but never the password after initial save. To use a saved connection, the backend reads and decrypts the file itself.
- **Encrypted connection files use AES-256-GCM** with a key derived from a static app-bound key for the PoC (documented as a known weakness — to be replaced with macOS Keychain in v0.2).
- **Destructive operation detection is server-side (Go).** The frontend cannot bypass it by crafting SQL strings; the SQL editor path also runs through the destructive-op check before execution.
- **Auto-LIMIT 300 default** for table browse view. SQL editor queries are NOT auto-limited (user wrote them explicitly).
- **All Go ↔ JS communication uses Wails bindings** (typed method calls). No direct HTTP server.
- **No external network calls** from the app other than the user-configured MySQL connections. No telemetry, no update checks.

### Anti-patterns to avoid

- Do **not** put SQL string construction in the React layer (except inside the raw SQL editor textarea, which is user input).
- Do **not** keep decrypted passwords in memory longer than the lifetime of the connection pool that uses them.
- Do **not** swallow MySQL errors — surface them verbatim to the user with the original error code.

---

## 6. File Plan

Files to create (in order of build):

```
CREATE  go.mod                                    — module init: bigphant
CREATE  main.go                                   — Wails app bootstrap
CREATE  app.go                                    — App struct with lifecycle hooks
CREATE  wails.json                                — Wails project config

CREATE  internal/crypto/aes.go                    — AES-GCM encrypt/decrypt for connection files
CREATE  internal/connections/store.go             — connection profile CRUD against ~/Library/Application Support/Bigphant/connections/
CREATE  internal/connections/model.go             — Connection struct, JSON shape

CREATE  internal/mysql/pool.go                    — per-connection sql.DB pool management
CREATE  internal/mysql/introspect.go              — SHOW DATABASES, SHOW TABLES, DESCRIBE, INFORMATION_SCHEMA queries
CREATE  internal/mysql/exec.go                    — query execution wrapper with destructive-op detection
CREATE  internal/mysql/types.go                   — Result, Column, Row shared types

CREATE  internal/sqlbuilder/select.go             — build SELECT with filters, pagination, column subset
CREATE  internal/sqlbuilder/mutate.go             — build INSERT, UPDATE, DELETE with PK identification
CREATE  internal/sqlbuilder/alter.go              — build ALTER TABLE for column add/edit/drop, index add/drop
CREATE  internal/sqlbuilder/safety.go             — destructive op classifier (parses SQL to detect missing WHERE)

CREATE  internal/export/csv.go                    — write result set to CSV
CREATE  internal/export/sql.go                    — write result set as INSERT statements

CREATE  frontend/package.json
CREATE  frontend/vite.config.ts
CREATE  frontend/tailwind.config.js
CREATE  frontend/src/main.tsx
CREATE  frontend/src/App.tsx                      — top-level router (ConnectionList vs Workspace)
CREATE  frontend/src/pages/ConnectionList.tsx     — list, create, edit, test, open connection
CREATE  frontend/src/pages/Workspace.tsx          — layout: sidebar (DBs/tables) + main pane
CREATE  frontend/src/pages/TableView.tsx          — grid, filters, columns, pagination, export
CREATE  frontend/src/pages/StructureView.tsx      — column list + ALTER UI
CREATE  frontend/src/pages/SqlEditor.tsx          — multi-tab editor + results pane
CREATE  frontend/src/pages/Settings.tsx           — destructive ops toggle, transaction mode, theme

CREATE  frontend/src/components/VerticalRowPanel.tsx   — TablePlus-style side panel
CREATE  frontend/src/components/DataGrid.tsx          — virtualized result grid
CREATE  frontend/src/components/FilterBar.tsx
CREATE  frontend/src/components/ColumnPicker.tsx
CREATE  frontend/src/components/DestructiveOpModal.tsx
CREATE  frontend/src/components/TransactionBar.tsx     — Commit/Rollback bar for explicit-commit mode

CREATE  frontend/src/hooks/useConnection.ts
CREATE  frontend/src/hooks/useTableData.ts
CREATE  frontend/src/lib/sql.ts                       — SQL preview formatter for confirm modals

CREATE  build/darwin/Info.plist
CREATE  build/darwin/icon.icns                        — placeholder is fine for PoC
CREATE  README.md                                     — build & run instructions
```

---

## 7. Data Model

### 7.1 Connection profile (stored as encrypted JSON, one file per connection)

```json
{
  "id": "uuid-v4",
  "name": "Local dev",
  "host": "127.0.0.1",
  "port": 3306,
  "username": "root",
  "password": "<plaintext inside encrypted file>",
  "default_database": "myapp",
  "read_only": false,
  "transaction_mode": "auto_commit",

  "ssh_enabled": false,
  "ssh_host": "bastion.example.com",
  "ssh_port": 22,
  "ssh_username": "ec2-user",
  "ssh_auth_method": "password",
  "ssh_password": "<plaintext inside encrypted file>",
  "ssh_private_key": "<PEM, plaintext inside encrypted file>",
  "ssh_passphrase": "<plaintext inside encrypted file>",

  "created_at": "2026-05-23T10:00:00Z",
  "updated_at": "2026-05-23T10:00:00Z"
}
```

File path: `~/Library/Application Support/Bigphant/connections/<id>.enc`
Encryption: AES-256-GCM. Nonce prepended to ciphertext.

**SSH tunnel (added post-PRD).** When `ssh_enabled`, the Go backend opens an SSH
connection (`internal/sshtunnel`) and routes the DB pool's TCP dial through it —
MySQL via `mysql.RegisterDialContext`, Postgres via a pgx `DialFunc` registered
with `stdlib.RegisterConnConfig`. `ssh_auth_method` is `"password"` or `"key"`;
the three SSH secrets (`ssh_password`, `ssh_private_key`, `ssh_passphrase`) are
encrypted on disk and, like the DB password, never sent to the frontend — they
are stripped from `ConnectionMeta`, and a blank value on update preserves the
stored one. **Known weakness:** the SSH host key is not verified
(`ssh.InsecureIgnoreHostKey`), mirroring the static-key weakness in §5; real
`known_hosts` verification is a follow-up.

### 7.2 App settings (single plaintext JSON)

```json
{
  "allow_destructive_without_where": false,
  "default_transaction_mode": "auto_commit",
  "theme": "system"
}
```

File path: `~/Library/Application Support/Bigphant/settings.json`

### 7.3 No application database

Bigphant has no internal DB. All persistent state is the two files above plus optional saved-queries JSON (Could Have #35).

---

## 8. Wails Method Contracts (Go ↔ React bridge)

These are methods exposed on the `App` struct (or a dedicated service struct) and called from React via `wailsjs/go/...`. Each signature is what the AI agent should generate verbatim.

### Connections

```go
// ListConnections returns metadata for all saved connections (no passwords).
ListConnections() ([]ConnectionMeta, error)

type ConnectionMeta struct {
    ID              string `json:"id"`
    Name            string `json:"name"`
    Host            string `json:"host"`
    Port            int    `json:"port"`
    Username        string `json:"username"`
    DefaultDatabase string `json:"default_database"`
    ReadOnly        bool   `json:"read_only"`
}

// CreateConnection persists a new connection (encrypted).
CreateConnection(input ConnectionInput) (ConnectionMeta, error)

type ConnectionInput struct {
    Name            string `json:"name"`
    Host            string `json:"host"`
    Port            int    `json:"port"`
    Username        string `json:"username"`
    Password        string `json:"password"`
    DefaultDatabase string `json:"default_database"`
    ReadOnly        bool   `json:"read_only"`
    TransactionMode string `json:"transaction_mode"` // "auto_commit" | "explicit_commit"
}

UpdateConnection(id string, input ConnectionInput) (ConnectionMeta, error)
DeleteConnection(id string) error
TestConnection(input ConnectionInput) (TestResult, error)

type TestResult struct {
    OK      bool   `json:"ok"`
    Message string `json:"message"`
}

// OpenConnection opens the connection in the current window context.
OpenConnection(id string) error
```

### Browsing

```go
ListDatabases() ([]string, error)
ListTables(database string) ([]TableSummary, error)

type TableSummary struct {
    Name       string `json:"name"`
    RowCount   int64  `json:"row_count"`
    Engine     string `json:"engine"`
    SizeBytes  int64  `json:"size_bytes"`
}

DescribeTable(database, table string) (TableStructure, error)

type TableStructure struct {
    Columns []ColumnInfo `json:"columns"`
    Indexes []IndexInfo  `json:"indexes"`
    PrimaryKey []string  `json:"primary_key"`
}
```

### Query execution

```go
// FetchRows runs a parameterized SELECT for the table view.
FetchRows(req FetchRowsRequest) (ResultSet, error)

type FetchRowsRequest struct {
    Database string   `json:"database"`
    Table    string   `json:"table"`
    Filters  []Filter `json:"filters"`
    Limit    int      `json:"limit"`   // default 300
    Offset   int      `json:"offset"`
    OrderBy  string   `json:"order_by"` // optional column
    OrderDir string   `json:"order_dir"` // "ASC" | "DESC"
}

type Filter struct {
    Column     string `json:"column"`
    Comparator string `json:"comparator"` // "=", "!=", ">", "<", ">=", "<=", "LIKE", "IS NULL", "IS NOT NULL"
    Value      string `json:"value"`      // ignored for IS NULL / IS NOT NULL
}

type ResultSet struct {
    Columns  []Column        `json:"columns"`
    Rows     [][]interface{} `json:"rows"`
    RowCount int             `json:"row_count"`
    SQL      string          `json:"sql"` // the SQL that was executed (for display)
}

// ExecuteRaw runs an arbitrary user-typed SQL string.
// Returns either ResultSet (for SELECT) or AffectedRows (for DML).
ExecuteRaw(sql string, options ExecOptions) (RawResult, error)

type ExecOptions struct {
    BypassDestructiveCheck bool `json:"bypass_destructive_check"`
}

type RawResult struct {
    IsQuery       bool       `json:"is_query"`
    ResultSet     *ResultSet `json:"result_set,omitempty"`
    AffectedRows  int64      `json:"affected_rows,omitempty"`
    DurationMs    int        `json:"duration_ms"`
    // If destructive op is detected and not bypassed, an error is returned with code "destructive_op_blocked"
}
```

### Mutations (CRUD via UI)

```go
InsertRow(database, table string, values map[string]interface{}) (int64, error)
UpdateRow(database, table string, pk map[string]interface{}, values map[string]interface{}) error
DeleteRows(database, table string, pks []map[string]interface{}) (int64, error)
```

### Schema editing (light)

```go
AddColumn(database, table string, col ColumnInfo) error
ModifyColumn(database, table, colName string, newDef ColumnInfo) error
DropColumn(database, table, colName string) error
AddIndex(database, table string, idx IndexInfo) error
DropIndex(database, table, indexName string) error
```

### Transactions

```go
BeginTransaction() error
Commit() error
Rollback() error
TransactionStatus() (TxStatus, error)

type TxStatus struct {
    Active bool `json:"active"`
}
```

### Export

```go
ExportCSV(resultSet ResultSet, destPath string) error
ExportSQL(resultSet ResultSet, tableName string, destPath string) error
```

### Settings

```go
GetSettings() (AppSettings, error)
UpdateSettings(s AppSettings) error

type AppSettings struct {
    AllowDestructiveWithoutWhere bool   `json:"allow_destructive_without_where"`
    DefaultTransactionMode       string `json:"default_transaction_mode"`
    Theme                        string `json:"theme"` // "light" | "dark" | "system"
}
```

### Error shape

All errors returned to the frontend wrap an error code:

```go
type AppError struct {
    Code    string `json:"code"`    // e.g. "destructive_op_blocked", "mysql_error", "connection_failed"
    Message string `json:"message"` // verbatim message (MySQL errors passed through)
    SQL     string `json:"sql,omitempty"` // the offending SQL, if relevant
}
```

---

## 9. Destructive Operation Detection

Implemented in `internal/sqlbuilder/safety.go`. The PoC uses simple AST-light parsing — sufficient because MySQL syntax for the targeted dangerous patterns is constrained:

A query is classified **destructive** if any of the following is true:
1. Statement starts with `UPDATE` or `DELETE` and has no `WHERE` clause
2. Statement starts with `TRUNCATE`
3. Statement starts with `DROP` (TABLE, DATABASE, INDEX, etc.)
4. Statement is `ALTER TABLE ... DROP COLUMN`

Behaviour:
- If destructive AND `AllowDestructiveWithoutWhere = false`: return `AppError{Code: "destructive_op_blocked"}`. Frontend cannot bypass.
- If destructive AND `AllowDestructiveWithoutWhere = true`: return `AppError{Code: "destructive_op_requires_confirm"}`. Frontend shows `DestructiveOpModal`; if user confirms, retry the call with `ExecOptions{BypassDestructiveCheck: true}`.
- If non-destructive: execute normally.

Multi-statement payloads (separated by `;`): for the PoC, run them one at a time after splitting on `;` outside of strings — each statement passes through the same check.

---

## 10. Build Sequence

Each step should be independently completable. The agent should not start step N+1 until N is verified working manually.

```
1.  Initialize Wails project: `wails init -n bigphant -t react-ts`. Replace default scaffolding with the file plan above.
2.  Set up Tailwind + shadcn/ui in frontend/. Install base shadcn components: button, dialog, input, select, table, tabs, dropdown-menu, toast, sheet.
3.  Implement internal/crypto/aes.go (AES-256-GCM encrypt/decrypt with a constant key for PoC; flag as known weakness in comments).
4.  Implement internal/connections/store.go: list, create, update, delete, read. Connection files at ~/Library/Application Support/Bigphant/connections/<uuid>.enc.
5.  Expose connection Wails methods (ListConnections, CreateConnection, UpdateConnection, DeleteConnection, TestConnection) on the App struct.
6.  Build the ConnectionList page in React: list + create/edit form + Test button. No database connection yet — only profile management.
7.  Implement internal/mysql/pool.go: per-window sql.DB pool keyed by connection ID. Implement TestConnection using a real ping.
8.  Implement internal/mysql/introspect.go: ListDatabases, ListTables (with row counts from INFORMATION_SCHEMA), DescribeTable.
9.  Expose OpenConnection. In React, double-clicking a connection opens the Workspace page (still single-window for PoC; window-per-connection can be added with Wails runtime.WindowExecJS or wails.NewWindow in a later iteration — see note below).
10. Build the Workspace layout: left sidebar lists databases → expand to tables; main pane is empty initially.
11. Implement TableView page with DataGrid component (use TanStack Table or @tanstack/react-virtual for virtualization). Wire to FetchRows with LIMIT 300.
12. Add pagination controls (Prev/Next) that update offset.
13. Implement FilterBar component + Filter type. Build SQL in internal/sqlbuilder/select.go using parameterized queries — never string concat user values.
14. Implement ColumnPicker (client-side column visibility only).
15. Implement VerticalRowPanel: opens on single click of a row, shows all columns stacked. Save button calls UpdateRow.
16. Add double-click-to-edit-cell behaviour on the grid. On save: UpdateRow.
17. Implement Add Row + Delete Rows. Delete must trigger DestructiveOpModal even with a WHERE (since multi-row delete is high-risk).
18. Implement internal/sqlbuilder/safety.go and wire it into both ExecuteRaw and the mutation paths.
19. Implement StructureView page: list columns, Add/Edit/Drop column actions → AlterTable contracts. Every action previews the generated SQL in a modal before executing.
20. Implement SqlEditor page with multi-tab support (tabs are local component state). Cmd+Enter runs the query. Results render in a shared DataGrid.
21. Implement export/csv.go and export/sql.go. Wire to Export buttons in TableView and SqlEditor.
22. Implement Settings page with the three toggles. Persist to settings.json.
23. Implement transaction handling: when default_transaction_mode = "explicit_commit", wrap mutations in a tx; show TransactionBar; commit/rollback on user action.
24. Add JSON column pretty rendering in DataGrid (Should Have).
25. Add dark mode via shadcn theme provider (Should Have).
26. Add CSV import on TableView (Should Have).
27. Add in-memory session query history (Should Have).
28. Package via `wails build -platform darwin/universal`. Produce a .dmg using create-dmg or similar.
29. Manual smoke test against a local MySQL 8 instance with a realistic dataset (e.g. employees sample DB).
```

### Note on window-per-connection

True multi-window-per-connection requires either (a) launching a new app process per connection or (b) using Wails v2's multi-window support (still maturing as of writing). For the PoC, **single window with the ability to switch the active connection from the sidebar is acceptable**, with a stretch goal of opening a true second window if Wails multi-window support proves stable. Document this trade-off in the README. If multi-window adds more than a day of work, defer to v0.2.

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AES-GCM with a static app-bound key is weak (anyone with the binary can decrypt connection files) | Medium | Document as a known PoC weakness. Migrate to macOS Keychain in v0.2 before any public release. |
| Wails v2 multi-window support may not be stable enough for "one window per connection" | Medium | Fall back to in-app connection switcher for PoC. Re-evaluate for v0.2. |
| Destructive SQL detection via string parsing is fragile (comments, multi-statements, edge cases) | High | Conservative parser: if in doubt, classify as destructive. Better false-positive than false-negative. |
| `INFORMATION_SCHEMA.TABLES` row counts are approximate for InnoDB | Low | Label row counts as "approximate" in the UI when engine = InnoDB. |
| Large result sets (>10k rows) freeze the React grid | Medium | Hard LIMIT 300 in table view. SQL editor results: warn if returned rows > 5000; offer to truncate display. |
| Unsigned .dmg triggers Gatekeeper warnings for any external testers | Low | Document right-click → Open workaround in README. Signing/notarization is a v0.2 task. |
| Connection password held in Go memory longer than necessary | Low | Decrypt only when opening the connection; zero out the password byte slice after `sql.Open` returns its pool. |
| Solo developer scope creep (especially toward agentic features) | High | This PRD is the contract. Anything not in Must/Should/Could is Out of Scope, full stop. |

---

## 12. Definition of Done (PoC)

The PoC is "done" when **all Must Have criteria (1–29) work end-to-end against a real MySQL 8 server**, and:

### Backend (Go)
- [ ] All `internal/` packages compile and are usable from `app.go`
- [ ] All Wails methods listed in Section 8 are exposed and callable from the frontend
- [ ] Destructive op detection works for the four patterns in Section 9
- [ ] Encrypted connection files round-trip correctly
- [ ] No goroutine leaks or unclosed `sql.Rows` after a normal session

### Frontend (React)
- [ ] Connection list, workspace, table view, structure view, SQL editor, settings — all routable and rendering
- [ ] Vertical edit panel works
- [ ] Inline cell edit works
- [ ] Filters + column picker + pagination work
- [ ] Destructive op modal blocks/confirms as specified
- [ ] Dark mode works (Should Have)

### Manual test plan
- [ ] Connect to a local MySQL 8 instance with the `employees` sample database
- [ ] Browse → view a 300k-row table without freezing (because LIMIT 300)
- [ ] Insert, update (vertical + inline), delete rows
- [ ] Run a `SELECT` via SQL editor in a new tab
- [ ] Run an `UPDATE` without WHERE → confirm it is blocked
- [ ] Toggle safety flag OFF → run the same UPDATE → confirm modal appears → confirm → executes
- [ ] Add a column via Structure view → DESCRIBE confirms it's present
- [ ] Export 300 rows to CSV → file opens correctly in a spreadsheet app
- [ ] Switch transaction mode to explicit-commit → run UPDATE → see Commit/Rollback bar → Rollback → row unchanged

### Distribution
- [ ] `wails build -platform darwin/universal` produces a working `.app`
- [ ] `.dmg` opens and the app launches on a fresh macOS user account
- [ ] README documents the build steps and the Gatekeeper right-click-Open workaround

---

## 13. Guardrails for the AI Coding Agent

When building this, the agent **must**:
- Follow the file plan in Section 6 — do not invent new top-level packages.
- Match the Wails default conventions for the `App` struct and `main.go`.
- Use parameterized queries everywhere (`?` placeholders for MySQL); never `fmt.Sprintf` user values into SQL.
- Surface MySQL errors verbatim with their error codes.
- Use shadcn/ui components rather than rolling custom styled primitives.

The agent **must not**:
- Add features marked Out of Scope (Section 4), even if they seem trivial.
- Introduce a backend HTTP server — all communication is via Wails bindings.
- Add telemetry, analytics, or external network calls.
- Reach for ORMs (no GORM, no ent) — `database/sql` + `go-sql-driver/mysql` directly.
- Persist any application state in MySQL itself.

---

## 14. Open Questions (Not Blocking, Confirm Before v0.2)

- Move from AES-GCM file encryption to macOS Keychain — confirm approach (per-app-keychain vs login keychain).
- Multi-window strategy: separate process per connection vs Wails v2 multi-window.
- Code signing: enroll in Apple Developer Program before v0.2 release?
- Decide which engine comes next: PostgreSQL is the obvious choice; confirm.
- Begin scoping the agentic mode separately as a v0.3+ epic.

---

## 15. v0.4.0 — AI Assistant (delivers the §14 agentic epic)

Bring-your-own-key agentic chat that answers plain-language questions about a database.

- **Provider:** OpenRouter only — one OpenAI-compatible client at `https://openrouter.ai/api/v1`; the user supplies their key and picks any model (live list from `GET /models`). This is the single sanctioned AI endpoint. A token-metered "AI plan" (via `license.FeatAI`) is future scope.
- **Read-only by construction:** every AI query runs the `run_readonly_sql` tool against a dedicated read-only path. On opt-in, Bigphant provisions a SELECT-only DB user (`internal/ai/rouser.go`); if the connection lacks privilege it falls back to app-layer read-only enforcement on a separate pool. SELECT-only is also enforced in-app via `sqlbuilder.IsReadOnly`.
- **Secrets:** the OpenRouter key is encrypted on disk (`ai.enc`) and never sent to the frontend (only `has_key`). AI read-only credentials are stored in the connection's encrypted file like the DB/SSH secrets.
- **Context file:** auto-generated, user-editable Markdown per database at `~/Library/Application Support/Bigphant/context/<connID>/<database>.md`; the assistant always reads the current file. "Regenerate" re-syncs from the live schema.
- **Backend:** `internal/ai` (client, agentic loop, config, RO-user provisioning) + `internal/dbcontext` (generate/store). Wails methods: `GetAIConfig`, `SetAIConfig`, `ListAIModels`, `EnableAIAssistant`, `AIAssistantStatus`, `GenerateDBContext`, `GetDBContext`, `SaveDBContext`, `AIChat`. `AIChat` emits `ai:tool`/`ai:done` runtime events so the UI shows each query the model runs.
- **Frontend:** an "AI Assistant" workspace tab (chat + inline progress), the opt-in consent dialog, the context editor, and an AI section in Settings (key + model). Reuses `DataGrid`, the `Settings` `Row` pattern, and `lib/api.ts`.

## 16. v0.4.0 — SQLite engine

A third engine behind the `internal/engine.Engine` interface, alongside MySQL/MariaDB and PostgreSQL.

- **Driver:** pure-Go `modernc.org/sqlite` (no CGO) so `wails build -platform darwin/universal` needs no C toolchain. New package `internal/sqlite` implements the engine; `sqlbuilder.SQLiteDialect` provides quoting (double-quote idents) and `?` placeholders.
- **Connection = a file.** SQLite connections store a `FilePath` (non-secret) instead of host/port/user/password. The connection form hides the network/SSL/SSH fields and adds a "Database file" input plus a native picker (`PickSQLiteFile`). Opening a missing file errors rather than silently creating an empty database.
- **No namespace.** One file is one database: `ListDatabases` returns a single entry (the file name), `ListSchemas` is empty, and `database` arguments are ignored.
- **Read-only by construction for AI.** SQLite has no database users, so `EnableAIAssistant` always falls back to `app_layer`; the read-only pool additionally opens the file with `mode=ro` + `PRAGMA query_only`. `internal/dbcontext` works unchanged (it is generic over the engine interface).
- **Limited `ALTER TABLE`.** `buildAlterSQLite` supports ADD/DROP/RENAME COLUMN, RENAME TABLE, and standalone CREATE/DROP INDEX; modify-column, primary/foreign keys, checks, and defaults are rejected with a clear message (they would require a full table rebuild). No SSH tunnel (the file is local).

## 17. v0.5.0 — Maintenance / server administration

Native **Maintenance** menu (macOS/Windows menu bar) for server administration, modeled on TablePlus. Engine coverage: **MySQL/MariaDB + PostgreSQL full**; **SQLite** gets Database Maintenance only (VACUUM, integrity check, REINDEX).

- **Users & Permissions:** create/drop users (MySQL) or roles (Postgres); per-database privilege matrix (SELECT/INSERT/UPDATE/DELETE/CREATE/DROP/ALTER/INDEX/ALL). Passwords for new users are generated server-side when blank and never returned to the frontend.
- **Databases:** create a database with charset/collation (MySQL) or encoding/owner (Postgres). Database deletion from UI remains deferred.
- **Server Activity:** list running queries, kill a process, view lock waits.
- **Database Maintenance:** MySQL `OPTIMIZE`/`ANALYZE TABLE`; Postgres `VACUUM`/`ANALYZE`; SQLite `VACUUM`/`PRAGMA integrity_check`/`REINDEX`.
- **Backend:** optional `engine.MaintenanceEngine` capability interface (not part of mandatory `Engine`); Wails methods in `app_maint.go`; per-engine logic in `internal/<engine>/maint.go`; shared admin SQL builders in `internal/maint` with `sqlbuilder.ValidateIdentifier` + `QuoteStringLiteral`. Reuses `internal/ai/rouser.go` password pattern.
- **License gate:** all writes gated on `license.FeatModifySchema` + `requireWrite()` (same as structured DDL in `app_ddl.go`).
- **Frontend:** four dialogs under `frontend/src/components/maintenance/` wired from `Workspace.tsx` via `menu:maint-*` events. Capability check via `ServerCapabilities()` on open; unsupported features show a friendly empty state (SQLite for users/databases/activity).
- **Menu:** `Maintenance` submenu in `menu.go` after Connections: Manage Users & Permissions, Create Database, Server Activity, Database Maintenance.
