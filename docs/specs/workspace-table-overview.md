# Spec — Workspace Empty-State Table Overview

**Status:** Proposed
**Owner:** TBD
**Parent contract:** `docs/prd.md` (refines Browsing; PRD §3 "Browsing", §8 "Wails methods", §7 data model)
**Scope:** The workspace tab-area content shown when no tab is open. Backend extension to `ListTables` to carry the extra metadata. Does **not** touch the sidebar tree, the data grid, or the SQL editor.

---

## 1. Summary

Replace the placeholder text *"Select a table from the sidebar to begin."* with a **table overview grid** that lists every table in the current database (or Postgres schema) with its key metadata: row count, total size, data size, index size, character set / collation, and engine.

The overview is the workspace's default landing surface — what the user sees the moment they open a connection, switch databases, or close the last tab. Clicking a row opens that table in a new tab (same as clicking it in the sidebar).

---

## 2. Motivation

The current empty state is informational dead weight: the user already knows how to click the sidebar. Other clients (TablePlus, Sequel Ace, DBeaver) use the same screen real estate to surface table metadata that is otherwise buried in the structure view or a `SHOW TABLE STATUS` query. Having it visible at a glance answers the most common questions a developer has when opening an unfamiliar database:

- Which tables are biggest? Which are bloated by indexes?
- Which tables actually have data vs. are empty scaffolding?
- What charset is each table using? (Often surfaces legacy `latin1` tables in an otherwise `utf8mb4` DB.)
- Which engine? (MyISAM tables in an InnoDB DB are worth knowing about.)

---

## 3. Current State

| Layer | File | State |
|---|---|---|
| Empty-state UI | `frontend/src/pages/Workspace.tsx:380-383` | Renders a single `<span>` with the placeholder text inside the tab strip. **Gap.** |
| Table list (Go) | `internal/mysql/introspect.go` `ListTables` | Returns `[name, row_count, engine, data_length+index_length]`. **Missing: charset, separate index size.** |
| Table list (Postgres) | `internal/postgres/...` `ListTables` | Same `TableSummary` shape — populated from `pg_class` / `pg_stat_user_tables`. **Same gap.** |
| DTO | `internal/dbtypes/dbtypes.go` `TableSummary` | `{ Name, RowCount, Engine, SizeBytes }`. **Needs new fields.** |
| TS type | `frontend/src/lib/types.ts` `TableSummary` | Mirrors the Go DTO. **Needs new fields.** |
| Sidebar consumer | `frontend/src/components/Sidebar.tsx:303-306` | Uses `name` + `row_count` only. **Forwards-compatible — won't break when fields are added.** |

**Conclusion:** Adding fields to `TableSummary` is backward-compatible at every existing call site. The work splits into one backend change (extend the introspection query + DTO) and one frontend addition (a new component, plus wiring it into the workspace empty state).

---

## 4. Requirements

### 4.1 Must Have

- **M1 — Replace the empty state.** When `tabs.length === 0`, the workspace tab-content area renders the **TableOverview** grid instead of the placeholder text. The placeholder string is deleted.
- **M2 — Columns.** Each row shows: `Name`, `Rows` (count, human-formatted), `Size` (data + index, human-formatted bytes), `Data size`, `Index size`, `Charset / Collation`, `Engine`.
- **M3 — Click to open.** Clicking a row opens that table in a new tab (`openTable(name)` — same call the sidebar uses). Hover row highlight, cursor: pointer.
- **M4 — Sortable columns.** Clicking a column header sorts by that column (ASC ⇄ DESC toggle). Default sort: `Size` descending (largest first — the most useful question on first open). Sort is client-side; the list lives in memory already (`tables` state in Workspace).
- **M5 — Filter.** A search input at the top filters by table name (case-insensitive substring), independent of the sidebar's `Filter tables` input. State is local to the overview component (does not need to persist).
- **M6 — Backend metadata.** Extend `dbtypes.TableSummary` with `data_size_bytes`, `index_size_bytes`, `charset` (collation parsed to the charset portion, e.g. `utf8mb4_unicode_ci` → `utf8mb4`). Keep the existing `size_bytes` as `data + index` for backward compat (sidebar already uses it indirectly via row count only; new component reads the split values directly).
  - MySQL/MariaDB: extend the query in `internal/mysql/introspect.go` `ListTables` to also select `DATA_LENGTH`, `INDEX_LENGTH`, and `TABLE_COLLATION` from `INFORMATION_SCHEMA.TABLES`.
  - Postgres: populate `data_size_bytes` from `pg_relation_size`, `index_size_bytes` from `pg_indexes_size`, `charset` from `pg_database.datcollate` of the current DB (per-table charset is not a Postgres concept — return the database collation). `engine` stays empty (already does for Postgres).
- **M7 — No new round trips.** All overview data comes from the **existing** `ListTables` call. No second introspection call per render.
- **M8 — Approximate counts disclaimer.** Surface a small inline tooltip / muted hint near the Rows column header noting that counts are approximate for InnoDB / autovacuumed Postgres tables (matches PRD §11 caveat). One line, not a modal.

### 4.2 Should Have

- **S1 — Sticky header.** Column headers stay pinned on scroll so a 200-table database stays readable.
- **S2 — Empty database state.** If the database has zero tables, show a centered muted message ("No tables in `<db>`") instead of an empty grid. Keep it terse — no CTA, since DDL UI is out of scope.
- **S3 — Loading state.** While `loadingTables` is true, show a skeleton/spinner in the overview area (don't flash the empty-state message).
- **S4 — Right-click parity.** A row's context menu mirrors the sidebar's (Open / Open Structure / Truncate / Drop). Reuses the same `onDestructive` handler already passed into the sidebar so the destructive-op modal path is identical.

### 4.3 Could Have (deferred)

- **C1** — Total-DB footer row summing rows / size across all tables. Cheap to add later if useful.
- **C2** — Persisting the overview's sort/filter preference to `settings.json`.
- **C3** — A "last modified" column from `INFORMATION_SCHEMA.TABLES.UPDATE_TIME` / Postgres equivalents. Useful but unreliable across engines (InnoDB doesn't populate it); leave until asked.

### 4.4 Non-Goals

- No DDL actions (create/alter table) launched from the overview — out of scope per PRD §4.
- No re-implementing the sidebar list; the sidebar stays as-is. The overview is **additive** content for the main pane.
- No second engine round trip to enrich the listing — everything must come from one widened `ListTables` query.
- No per-row charts / sparklines.

---

## 5. Design

### 5.1 Backend — widen `TableSummary`

`internal/dbtypes/dbtypes.go`:

```go
type TableSummary struct {
    Name            string `json:"name"`
    RowCount        int64  `json:"row_count"`
    Engine          string `json:"engine"`
    SizeBytes       int64  `json:"size_bytes"`        // data + index (kept)
    DataSizeBytes   int64  `json:"data_size_bytes"`   // new
    IndexSizeBytes  int64  `json:"index_size_bytes"`  // new
    Charset         string `json:"charset"`           // new — "utf8mb4", "latin1", or DB collation (PG)
}
```

`internal/mysql/introspect.go` `ListTables`:

```sql
SELECT TABLE_NAME,
       COALESCE(TABLE_ROWS, 0),
       COALESCE(ENGINE, ''),
       COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0),
       COALESCE(DATA_LENGTH, 0),
       COALESCE(INDEX_LENGTH, 0),
       COALESCE(TABLE_COLLATION, '')
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME
```

Then in Go, derive `charset` from the collation by taking the substring before the first `_` (e.g. `utf8mb4_unicode_ci` → `utf8mb4`). Empty collation → empty charset.

Postgres connector: populate `DataSizeBytes` / `IndexSizeBytes` / `Charset` from the equivalents (`pg_relation_size`, `pg_indexes_size`, `pg_database.datcollate`). `SizeBytes` stays as the sum so existing consumers don't regress.

### 5.2 Frontend — `TableOverview` component

New file: `frontend/src/components/TableOverview.tsx`.

```tsx
interface TableOverviewProps {
  database: string              // for the empty-state message
  tables: TableSummary[]
  loading: boolean
  onOpenTable: (name: string, sub?: "data" | "structure") => void
  onDestructive: (sql: string) => void
  identQuote: "`" | "\""        // for Truncate/Drop SQL (driver-aware)
}
```

Layout: a card-style container with a sticky-header `<table>` (or a `<div>` grid — pick whichever maps cleanly to shadcn's existing patterns in the repo). Header row: `Name | Rows | Size | Data | Index | Charset | Engine`, each clickable to sort. Body rows: one per table, clickable to open, with hover highlight and a context menu.

State (component-local):
- `sortBy: keyof TableSummary` (default `"size_bytes"`)
- `sortDir: "asc" | "desc"` (default `"desc"`)
- `filter: string`

Derive `visible = tables.filter(name match).sort(by sortBy/sortDir)` in the render pass — `tables` is at most a few hundred rows; no virtualization needed for v1 (revisit if a user has 5k+ tables).

Reuse the existing `formatCount` helper from `Sidebar.tsx` (move it into `frontend/src/lib/format.ts` and import from both — small refactor in the same PR). Add a `formatBytes` helper alongside it.

### 5.3 Wiring into Workspace

`frontend/src/pages/Workspace.tsx:378-383` — replace the placeholder branch:

```tsx
{tabs.length === 0 ? (
  <div className="min-h-0 flex-1 overflow-auto">
    <TableOverview
      database={namespace}
      tables={tables}
      loading={loadingTables}
      onOpenTable={openTable}
      onDestructive={runRawSQL}
      identQuote={connection.driver === "postgres" ? "\"" : "`"}
    />
  </div>
) : (
  /* existing tab strip */
)}
```

Note that the tab strip itself should still render when `tabs.length === 0` is false — restructure so the empty case **replaces** the tab strip + content area entirely, not just the area inside the strip. The current placeholder lives *inside* the tab strip, which means the strip's border-bottom is visible above empty content; the new overview should own the full pane.

### 5.4 Refresh behavior

`tables` is already kept fresh by the existing effect keyed on `[namespace, dataVersion]` (Workspace.tsx:80-88). Any TRUNCATE/DROP from the overview's context menu flows through `runRawSQL → afterMutation → setDataVersion(v+1)`, which re-fetches `ListTables`, which re-renders the overview. No new wiring needed.

---

## 6. UI / UX decisions

| Decision | Choice | Rationale |
|---|---|---|
| Default sort | `Size` desc | "What's eating disk?" is the most common first question. Name-asc is one click away. |
| Click target | Whole row opens table | Larger target; matches sidebar convention. Context menu carries destructive actions so a stray click is safe. |
| Charset display | Charset only (not full collation) | Full collation strings are noisy (`utf8mb4_0900_ai_ci`) and the charset is what matters for compatibility. Hover/tooltip can show full collation — optional. |
| Size unit | Human-readable (KB/MB/GB) with tabular-nums | Readable at a glance; tabular-nums keeps the column aligned. |
| Empty DB | Centered muted text | No CTA — DDL is out of scope. |
| Approximate-count hint | Small `(i)` tooltip on the `Rows` header | Honors PRD §11 without polluting every row. |

---

## 7. Edge cases

- **Engine without `INFORMATION_SCHEMA.TABLES` stats** (rare on managed MySQL) → `TABLE_ROWS` / `DATA_LENGTH` come back NULL; `COALESCE` already handles this — display `0` / `—`. Don't crash.
- **Postgres without per-table charset** → `charset` falls back to the database-level `datcollate`. Document that this is intentional in a one-line comment in the Postgres connector.
- **Very large DBs (5k+ tables)** → out of v1 scope; if it becomes a problem, add virtualization (e.g. TanStack Virtual). The sidebar has the same characteristic today and hasn't needed it.
- **MyISAM in an InnoDB DB** → just renders with `MyISAM` in the Engine column; no special highlight.
- **System schemas (`information_schema`, `mysql`, `performance_schema`)** → these databases are reachable via the picker but their tables aren't writable. The overview renders them normally; Truncate/Drop will fail with a verbatim MySQL permission error via the existing destructive-op path. No special handling.
- **Switching database** while a sort/filter is active → component remounts with the new `tables` prop (key on `namespace` if needed); filter resets, sort can stay (it's just a column name).

---

## 8. Files to change

| File | Change |
|---|---|
| `internal/dbtypes/dbtypes.go` | Add `DataSizeBytes`, `IndexSizeBytes`, `Charset` to `TableSummary`. |
| `internal/mysql/introspect.go` | Widen the `ListTables` SELECT; parse collation → charset. |
| `internal/postgres/introspect.go` | Populate the new fields from `pg_relation_size` / `pg_indexes_size` / `pg_database.datcollate`. |
| `frontend/src/lib/types.ts` | Mirror the three new fields on `TableSummary`. |
| `frontend/src/lib/format.ts` *(new)* | Extract `formatCount` from Sidebar, add `formatBytes`. |
| `frontend/src/components/Sidebar.tsx` | Import `formatCount` from the new module. |
| `frontend/src/components/TableOverview.tsx` *(new)* | The grid component (see §5.2). |
| `frontend/src/pages/Workspace.tsx` | Render `<TableOverview>` when `tabs.length === 0`; remove the placeholder string and restructure the empty-state branch (see §5.3). |
| `frontend/wailsjs/go/models.ts` | Auto-regenerated by `wails dev` after the DTO change — do not edit by hand. |

No SQL builder, no `app.go` method signature changes, no new Wails methods.

---

## 9. Acceptance criteria

1. Opening a connection or switching databases displays the table overview grid (no placeholder text anywhere).
2. The grid lists every base table in the active database/schema with name, rows, total size, data size, index size, charset, and engine.
3. Default sort is by total size, descending. Clicking another header re-sorts; clicking the active header toggles direction.
4. Typing in the filter input narrows the visible rows by name substring (case-insensitive).
5. Clicking a row opens that table in a new tab — same behavior as clicking it in the sidebar.
6. Right-clicking a row shows Open / Open Structure / Truncate / Drop; destructive items flow through the existing `DestructiveOpModal` path.
7. Truncating/dropping a table refreshes the overview without a manual reload.
8. Switching to a database with zero tables shows the empty-DB message (S2), not an empty grid.
9. While `loadingTables` is true, the overview shows a loading indicator (not the empty-state).
10. Sidebar continues to render `name + row_count` as before — no regression.
11. For a Postgres connection, the grid renders with `charset` populated from the DB-level collation and `engine` empty.

---

## 10. Test notes

- **Manual (PoC default):** verify against a MySQL DB with mixed engines (InnoDB + MyISAM) and mixed charsets (utf8mb4 + latin1), a tiny DB (3 tables), and a fat one (100+ tables). For Postgres, hit a DB with varied table sizes and confirm the size/index columns populate.
- **Optional unit (Go):** add a `dbtypes` round-trip test (JSON marshal/unmarshal) to lock the field names. A `parseCharset("utf8mb4_unicode_ci") == "utf8mb4"` test is cheap and worth having.

---

## 11. Out of scope (restated)

DDL actions from the overview, per-column metadata in the overview row, persisted sort/filter, virtualized rendering, last-modified timestamps, total-DB footer row, and any change to the sidebar's existing layout. Anything not listed in §4.1/§4.2 is deferred per the PRD's "PRD is the contract" rule.
