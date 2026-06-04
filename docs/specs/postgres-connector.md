# Spec — PostgreSQL Connector

**Status:** Proposed (post-PoC, scope-expanding)
**Target version:** v0.3.0 — *multi-engine* milestone (MariaDB is the v0.2.0 milestone; this builds on the engine abstraction introduced there)
**Owner:** TBD
**Parent contract:** `docs/prd.md`

> ⚠️ **Scope note.** The current PoC is explicitly **single-engine (MySQL)** and
> the PRD §4 lists "any non-MySQL engine" as **out of scope**. This document is a
> *forward-planning artifact*, not part of the PoC contract. Adopting it is a
> deliberate decision to grow Bigphant into a multi-engine client, and it
> requires a real architectural refactor (see §4). Nothing here should be built
> against the v0.0.x PoC without that decision being made first.

---

## 1. Summary

Add PostgreSQL as a second database engine alongside MySQL, reachable from the
same connection manager and table-browse / SQL-editor UI. The connector must
honor every existing hard constraint (all access through the backend; no
frontend SQL construction except the raw editor; server-side destructive
classification; encrypted credentials; verbatim error surfacing).

PostgreSQL is not a "MySQL variant" the way MariaDB is — it differs in identifier
quoting, parameter placeholders, the catalog/schema model, introspection
queries, and last-insert-id semantics. So this connector cannot be a flavor flag
on the existing `mysql` package; it requires an **engine abstraction** that both
`mysql` and a new `postgres` package implement.

---

## 2. Motivation

PostgreSQL is the most-requested engine for a tool in this category and the
natural second engine after MySQL. The codebase already anticipates this:
`connections.Connection.Driver` is documented as `"mysql" | future engines`, and
`Conn` already carries a `flavor` distinction. The groundwork is partial; this
spec completes it.

---

## 3. Current MySQL coupling (what must generalize)

A survey of where the codebase assumes MySQL. Each is a required change point.

| # | Concern | Current MySQL-specific code | PostgreSQL difference |
|---|---|---|---|
| C1 | Driver / DSN | `internal/mysql/driver.go` imports `go-sql-driver/mysql`; `pool.go::dsn` builds `user:pass@tcp(host:port)/db?...`; `sql.Open("mysql", …)` | `pgx` (stdlib `database/sql` adapter) or `lib/pq`; DSN is `postgres://user:pass@host:port/db?sslmode=…` or keyword form |
| C2 | Identifier quoting | `sqlbuilder/select.go::quoteIdent` uses **backticks** `` `col` `` | PostgreSQL uses **double quotes** `"col"`; backticks are a syntax error |
| C3 | Placeholders | `sqlbuilder/{select,mutate}.go` emit `?` | PostgreSQL uses **ordinal** placeholders `$1, $2, …`; `database/sql` does **not** rewrite them |
| C4 | Catalog / schema model | "database" is flat; `qualified()` builds `` `db`.`table` `` | 3-level: **database → schema → table**. You cannot cross *database* in one connection; you cross *schemas* (default `public`). `db.table` ≠ valid; it's `schema.table` |
| C5 | List databases | `introspect.go` `SHOW DATABASES` | `SELECT datname FROM pg_database WHERE datistemplate = false` — but switching database means a **new connection**, not `USE` |
| C6 | List tables / sizes | `INFORMATION_SCHEMA.TABLES` with `TABLE_SCHEMA`, `ENGINE`, `DATA_LENGTH+INDEX_LENGTH`, approx `TABLE_ROWS` | `pg_catalog` / `information_schema`; no `ENGINE`; size via `pg_total_relation_size()`; approx rows via `pg_class.reltuples` |
| C7 | Describe columns / PK | `INFORMATION_SCHEMA.COLUMNS` (`COLUMN_TYPE`, `COLUMN_KEY='PRI'`, `EXTRA='auto_increment'`) | `information_schema.columns` lacks `COLUMN_KEY`/`EXTRA`; PK via `table_constraints`+`key_column_usage` or `pg_index`; "auto-increment" = `serial`/`IDENTITY` (detect via `column_default LIKE 'nextval%'` or `is_identity`) |
| C8 | Indexes | `INFORMATION_SCHEMA.STATISTICS` (`NON_UNIQUE`, `SEQ_IN_INDEX`) | `pg_index` + `pg_class` + `pg_attribute`, or `pg_indexes` |
| C9 | Last insert id | `exec.go::InsertRow` uses `res.LastInsertId()` | pgx/pq **do not support** `LastInsertId()`; must use `INSERT … RETURNING <pk>` and scan |
| C10 | Set active database (raw editor) | `exec.go::ExecuteRaw` issues `` USE `db` `` | PostgreSQL has **no `USE`**; switch DB = reconnect. Schema context = `SET search_path TO "schema"` |
| C11 | Value conversion | `query.go::convertValue` handles `[]byte`, `time.Time`, `JSON` | pgx returns richer Go types; `jsonb`, `uuid`, arrays (`int[]`), `numeric`, `bytea`, `interval`, network types need mapping |
| C12 | Version / flavor | `introspect.go::detectFlavor` parses `SELECT VERSION()` for "MariaDB" | `SELECT version()` returns `PostgreSQL 16.2 on …`; or `SHOW server_version` |
| C13 | App-layer wiring | `app.go` hardcodes `mysql.Open` / `mysql.Ping` and returns `mysql.*` types | Must dispatch on `Connection.Driver` and return engine-neutral DTOs |
| C14 | Destructive classifier | `sqlbuilder/safety.go` keyword rules | Mostly engine-neutral (UPDATE/DELETE/TRUNCATE/DROP/ALTER DROP COLUMN exist in both). **Keep shared**; review only for PG-specific destructive verbs if desired |
| C15 | Connection defaults | MySQL port `3306` | PostgreSQL port `5432`; default database often `postgres`; default schema `public` |

---

## 4. Architecture — engine abstraction

The refactor that makes this tractable. Two layers:

### 4.1 `sqlbuilder.Dialect` (quoting + placeholders)

`internal/sqlbuilder` is engine-agnostic SQL assembly today but hardcodes
backticks and `?`. Introduce a small dialect:

```go
type Dialect interface {
    QuoteIdent(name string) string  // MySQL: `x`  PG: "x"
    Placeholder(n int) string       // MySQL: "?"  PG: "$N"  (n is 1-based)
}
```

- `BuildSelect`, `BuildInsert`, `BuildUpdate`, `BuildDelete` take a `Dialect`
  (or a `*Builder` constructed with one) and call `d.QuoteIdent` / `d.Placeholder(i)`
  instead of literals.
- MySQL dialect ignores `n` and returns `?`; PostgreSQL returns `"$"+n`.
- `qualified()` becomes dialect-aware **and namespace-aware** (C4): for PG it
  joins `schema.table`, for MySQL `db.table`.
- `Classify`/`IsReadOnly`/`FirstKeyword` stay shared, untouched (C14).

### 4.2 `Engine` interface (connection + introspection + exec)

Promote the surface of `internal/mysql.Conn` into an interface that `app.go`
depends on, implemented by both `internal/mysql` and a new `internal/postgres`:

```go
type Engine interface {
    // lifecycle
    Close() error
    Ping() error
    Version() (string, error)
    Flavor() string

    // navigation / introspection
    ListDatabases() ([]string, error)
    ListSchemas(database string) ([]string, error)   // NEW — MySQL returns [""] or nil
    ListTables(namespace string) ([]TableSummary, error)
    DescribeTable(namespace, table string) (TableStructure, error)
    SchemaColumns(namespace string) (map[string][]string, error)

    // data
    FetchRows(req sqlbuilder.FetchRowsRequest) (ResultSet, error)
    InsertRow(ns, table string, values map[string]any) (int64, error)
    UpdateRow(ns, table string, pk, values map[string]any) error
    DeleteRows(ns, table string, pks []map[string]any) (int64, error)
    ExecuteRaw(query, namespace string, bypass, allowDestructive bool) (RawResult, error)

    // transactions
    SetTxMode(mode string)
    Commit() error
    Rollback() error
}
```

- The shared **DTOs** (`Column`, `ResultSet`, `RawResult`, `TableSummary`,
  `ColumnInfo`, `IndexInfo`, `TableStructure`) move to a neutral package
  (e.g. `internal/dbtypes`) so both engines and `app.go` share them without
  importing `mysql`. JSON tags stay identical → **no frontend type changes** for
  existing fields.
- `app.go` replaces `conn *mysql.Conn` with `conn Engine`, and `Open` becomes a
  factory dispatching on `Connection.Driver`:

```go
func openEngine(c connections.Connection) (Engine, error) {
    switch c.Driver {
    case "postgres":
        return postgres.Open(c)
    case "mysql", "":
        return mysql.Open(c)
    default:
        return nil, fmt.Errorf("unsupported driver %q", c.Driver)
    }
}
```

> **Migration discipline:** do the abstraction extraction (4.1 + 4.2 with only
> the MySQL impl) as a **behavior-preserving refactor first**, verify MySQL still
> works end-to-end, *then* add the `postgres` package. Don't interleave.

---

## 5. The namespace problem (most important design decision)

MySQL's "database" and PostgreSQL's "schema" occupy the same UI slot (the
sidebar's second level) but are not the same thing:

| | MySQL | PostgreSQL |
|---|---|---|
| Levels | server → **database** → table | server → database → **schema** → table |
| Cross-* in one conn | cross-database: yes (`db.table`) | cross-database: **no**; cross-schema: yes (`schema.table`) |
| Switch context | `USE db` | new connection (DB) / `SET search_path` (schema) |

**Recommended model for v0.3.0:** the connection is **pinned to one PostgreSQL
database** (the connection's `default_database`, mirroring how `pgx`/`psql`
work). The sidebar's "database" level then lists **schemas** for PostgreSQL
(default `public`), and the existing `database` parameter threaded through
`FetchRows`/`DescribeTable`/etc. carries the **schema name** for PG. `ListDatabases`
still exists (so the user can see/switch which database the connection targets),
but switching database = open a new pool, not `USE`.

This keeps the Wails method signatures (PRD §8) **unchanged** — the `database`
argument is reinterpreted as "namespace" per engine. Document this clearly; it's
the single biggest conceptual seam.

Open alternative (heavier): expose a true 3-level tree (database ▸ schema ▸
table) in the sidebar for PG only. **Deferred** — larger frontend change; not
required for a usable v1 connector.

---

## 6. TLS / sslmode (constraint conflict — must resolve)

PRD §4 lists **"SSL/TLS options"** as out of scope. But many PostgreSQL servers
(especially managed: RDS, Cloud SQL, Supabase, Neon) **require** SSL and will
refuse `sslmode=disable`. A Postgres connector that can't reach the most common
real-world servers is of limited value.

**Decision required.** Options:

- **(a)** Hardcode `sslmode=prefer` (try SSL, fall back to plaintext) — connects
  to both local and most managed servers with **zero new UI**, staying within the
  "no SSL *options*" spirit (no cert config exposed). **Recommended.**
- **(b)** Hardcode `sslmode=disable` — local-dev only; breaks on managed PG.
- **(c)** Add a minimal sslmode dropdown — contradicts PRD §4 as written; defer.

This spec assumes **(a)** unless overridden. It is an explicit, documented
relaxation of PRD §4 for the multi-engine milestone.

---

## 7. Detailed change list

### 7.1 New package `internal/postgres`

Mirror the `mysql` package file-for-file against the `Engine` interface:

- `driver.go` — `import _ "github.com/jackc/pgx/v5/stdlib"` (registers `"pgx"`).
- `pool.go` — `Open`/`Ping`; DSN `postgres://user:pass@host:port/db?sslmode=prefer`
  via `url.URL` (so password special chars are escaped, not `fmt.Sprintf`'d);
  same pool sizing and ping verification; `BeginTx`/`Commit`/`Rollback` reuse the
  identical `database/sql` Tx logic (copy or share via an embedded helper).
- `introspect.go` — PG catalog queries (C5–C8, C12). See §7.4.
- `query.go` — `FetchRows` + `scanResult` + `convertValue` for PG types (C11).
- `exec.go` — `InsertRow` via `RETURNING` (C9); `ExecuteRaw` with
  `SET search_path` instead of `USE` (C10); same read-only + destructive gating
  (reuse `sqlbuilder.Classify`/`IsReadOnly`).

### 7.2 `internal/sqlbuilder`

- Add `Dialect` (§4.1). Provide `MySQLDialect` and `PostgresDialect`.
- Thread dialect through the four builders; PG path emits `"ident"` and `$N`.
- `BuildInsert` (PG) appends `RETURNING <pk cols>` when a PK is known, so
  `InsertRow` can scan the generated id. (Requires passing PK columns, or a
  best-effort `RETURNING *` / no RETURNING when PK unknown → `InsertRow` returns 0.)
- `BuildSelect` ORDER BY / LIMIT / OFFSET: both engines accept
  `LIMIT n OFFSET m` and `ORDER BY "col" ASC|DESC`, so only quoting changes.

### 7.3 Shared DTOs → `internal/dbtypes`

Move `types.go` structs out of `mysql` into a neutral package; both engines and
`app.go` import it. JSON tags unchanged. `app.go` return types become
`dbtypes.*`. Wails regenerates bindings; **frontend `types.ts` unchanged** for
existing fields (Go type *path* changes, JSON shape does not).

### 7.4 PostgreSQL introspection queries (reference)

```sql
-- ListDatabases
SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;

-- ListSchemas (the "database" level for PG)
SELECT schema_name FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog','information_schema')
  AND schema_name NOT LIKE 'pg_temp%' AND schema_name NOT LIKE 'pg_toast%'
ORDER BY schema_name;

-- ListTables (namespace = schema), with approx rows + total size
SELECT c.relname,
       COALESCE(c.reltuples, 0)::bigint           AS approx_rows,
       ''                                          AS engine,  -- N/A for PG
       pg_total_relation_size(c.oid)               AS size_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1 AND c.relkind = 'r'
ORDER BY c.relname;

-- Columns + PK (one query for columns; PK from constraints)
SELECT column_name, data_type, is_nullable, column_default,
       (is_identity = 'YES' OR column_default LIKE 'nextval(%') AS is_auto
FROM information_schema.columns
WHERE table_schema = $1 AND table_name = $2
ORDER BY ordinal_position;

SELECT kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = $1 AND tc.table_name = $2
ORDER BY kcu.ordinal_position;

-- Indexes
SELECT i.relname AS index_name, ix.indisunique AS is_unique, a.attname AS column_name
FROM pg_class t
JOIN pg_index ix      ON t.oid = ix.indrelid
JOIN pg_class i       ON i.oid = ix.indexrelid
JOIN pg_namespace n   ON n.oid = t.relnamespace
JOIN pg_attribute a   ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE n.nspname = $1 AND t.relname = $2
ORDER BY i.relname, array_position(ix.indkey, a.attnum);
```

Map results onto the existing DTOs. Note `ColumnInfo.Key` (`"PRI"|"UNI"|"MUL"|""`)
and `Extra` (`"auto_increment"`) are MySQL vocab; for PG, populate `Key="PRI"`
for PK members and `Extra="auto_increment"` when `is_auto` so the **frontend's
existing `autoCols`/PK logic works unchanged** (it regex-matches
`/auto_increment|generated/i` and reads `primary_key`).

### 7.5 `internal/connections`

- No struct change needed — `Driver` already exists. Validate it against
  `{"mysql","postgres"}` on save.
- Default port logic: if `Port == 0`, default by driver (`3306` / `5432`).

### 7.6 Frontend (minimal)

- New/Edit Connection form: add an **engine selector** (MySQL / PostgreSQL)
  bound to `driver`; default port + default database placeholder follow the
  choice; default schema `public` hint for PG.
- Connection list: show an engine badge/icon per connection (`driver`).
- Everywhere "database" appears in the sidebar, the label can stay "database"
  generically, or be relabeled "schema" when `driver === "postgres"` (cosmetic,
  Should-have).
- **No change** to DataGrid, FilterBar, TableView query plumbing — they speak the
  same Wails methods and DTOs.

---

## 8. Requirements

### 8.1 Must Have

- **M1** — Create, test, save (encrypted), and open a PostgreSQL connection from
  the existing connection manager; credentials never reach the frontend.
- **M2** — Browse tables in a schema: sidebar lists schemas (the "database"
  level) and their base tables with approx row counts and size.
- **M3** — Table-browse grid works: paginated `SELECT` with auto-`LIMIT 300`,
  filters, and order-by, built server-side with `"ident"` quoting and `$N`
  placeholders (never `fmt.Sprintf` of values).
- **M4** — Structure view: columns (type, nullable, default), primary key, and
  indexes via PG catalog queries.
- **M5** — Inline CRUD: insert (id via `RETURNING`), update, delete by PK,
  honoring read-only and the **shared** destructive classifier.
- **M6** — Raw SQL editor runs against PG; schema context via `SET search_path`;
  results and errors surfaced verbatim with PG error codes via `AppError`.
- **M7** — Transactions (auto-commit / explicit-commit) work identically via the
  shared `database/sql` Tx path.
- **M8** — MySQL behavior is **byte-for-byte unchanged** after the refactor
  (regression bar).

### 8.2 Should Have

- **S1** — Engine badge in the connection list and form.
- **S2** — Sidebar relabels "database" → "schema" for PG connections.
- **S3** — Common PG types render well in the grid: `jsonb` (as `{…}` badge like
  MySQL JSON), `uuid`, `timestamptz`, `numeric`, arrays (`{1,2,3}` → readable).

### 8.3 Could Have

- **C-1** — `sslmode` selector (only if §6 decision lands on (c)).
- **C-2** — True 3-level sidebar (database ▸ schema ▸ table) for PG (§5 alt).
- **C-3** — PG-specific destructive verbs in the classifier (e.g. `REINDEX`,
  schema `DROP`)—likely already covered by `drop`.

### 8.4 Non-Goals (this milestone)

- Multiple databases browsable in one connection without reconnect.
- PG-only object types: views, materialized views, sequences, functions,
  extensions, enums management (consistent with PRD §4 for MySQL).
- SSH tunneling, full TLS cert configuration (PRD §4).
- Other engines (SQLite, SQL Server, etc.).

---

## 9. Edge cases & risks

- **No PK table** → `InsertRow` can't `RETURNING` a known id; return 0 and let the
  frontend's existing "no primary key — cannot update/delete" guards apply
  (already handled in `TableView`).
- **Case folding** — PG folds unquoted identifiers to lowercase; we always quote,
  so a table created as `"MyTable"` is reachable but `MyTable` (unquoted in raw
  editor) resolves to `mytable`. Document; not our bug.
- **`reltuples` = -1** on never-analyzed tables → clamp to 0 in `ListTables`.
- **Placeholder rewriting** — the single most common porting bug. The builders
  must generate `$N` from the start for PG; do **not** post-process `?`→`$N` with
  string replace (breaks on `?` inside string literals; builders don't emit those
  anyway, but the rule stands).
- **`search_path` leakage** in `ExecuteRaw` — set it on the dedicated `conn`
  acquired per call (mirroring the existing `USE` pattern) so it doesn't bleed
  across pooled connections.
- **Type scan surprises** — pgx returns `[16]byte` for `uuid`, `pgtype` structs
  for some types; `convertValue` must stringify these predictably. Budget test
  time here.
- **Refactor blast radius** — the `Engine`/DTO extraction touches `app.go` and
  every `mysql.*` reference. Mitigate with the "refactor-first, behavior-
  preserving, MySQL-green" discipline (§4.2).

---

## 10. Files touched (summary)

| Area | Files |
|---|---|
| New engine | `internal/postgres/{driver,pool,introspect,query,exec}.go` |
| Abstraction | `internal/sqlbuilder/dialect.go` (new) + edits to `select.go`, `mutate.go` |
| Shared DTOs | new `internal/dbtypes/types.go`; `internal/mysql/types.go` re-exports or is removed |
| Engine iface + factory | `internal/dbtypes` or `internal/engine` (interface); `app.go` factory + field type change |
| Connections | `internal/connections/model.go` (driver validation, default port) |
| Frontend | Connection form/list (engine selector + badge); optional sidebar relabel |
| Docs | this spec; update `docs/prd.md` §4 to note the multi-engine milestone relaxes the single-engine constraint |

---

## 11. Acceptance criteria

1. A PostgreSQL connection (local + at least one managed server via `sslmode=prefer`)
   can be created, tested, saved encrypted, and opened.
2. Schemas list in the sidebar; selecting one lists its base tables with row
   count and size.
3. Browsing a table issues `SELECT … FROM "schema"."table" … LIMIT 300` with
   `$N`-bound filter values; order-by and pagination work.
4. Structure view shows columns, the correct primary key, and indexes.
5. Insert returns the generated id (serial/identity) via `RETURNING`; update and
   delete by PK succeed; destructive statements are classified server-side
   identically to MySQL.
6. Raw editor: a multi-statement-free query runs in the selected schema; a PG
   error (e.g. `42P01 undefined_table`) is surfaced verbatim with its code.
7. Explicit-commit mode: an insert is invisible to a second connection until
   Commit; Rollback discards it.
8. **Regression:** the full existing MySQL acceptance set passes unchanged.

---

## 12. Test notes

- **Go unit:** dialect quoting/placeholder tests (`"x"`+`$1` vs `` `x` ``+`?`);
  `BuildInsert … RETURNING`; `convertValue` for `jsonb`/`uuid`/`numeric`/arrays/
  `bytea`/`timestamptz`.
- **Integration:** spin a `postgres:16` container; run the introspection + CRUD
  path. Mirror with the existing MySQL container so both engines run in CI.
- **Manual (PoC style):** one local PG, one managed PG (SSL), one MySQL — confirm
  M8 regression by exercising MySQL after the refactor.

---

## 13. Open questions (resolve before build)

1. **§6 sslmode** — confirm `sslmode=prefer` with no UI (recommended) vs adding a
   selector. *Blocks managed-server support.*
2. **§5 namespace model** — confirm "connection pinned to one database, sidebar
   lists schemas" (recommended) vs a true 3-level tree.
3. **Driver choice** — `pgx` stdlib adapter (recommended; actively maintained)
   vs `lib/pq` (in maintenance mode).
4. **Milestone ordering** — does the `Engine`/`Dialect` abstraction land in
   v0.2.0 (alongside MariaDB) or here in v0.3.0? Sharing it with MariaDB reduces
   total churn.
5. **`internal/mysql` package name** — keep as-is, or rename the gateway concept
   now that it's no longer the sole engine (cosmetic; defer).
```
