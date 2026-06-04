# Spec — Browse All Database Entities (Views, Functions, …)

**Status:** Implemented (backend + sidebar + tabs; overview kind filter S2 still deferred)
**Owner:** TBD
**Parent contract:** `docs/prd.md` (refines Browsing; PRD §3, §8). **Departs from PRD §4** — see §1.1 below.
**Scope:** Read-only listing of non-table database entities (views, materialized views, functions, procedures, triggers, sequences, events, enums) in the sidebar and table-overview pane. Browsing **view** data as if it were a table. Read-only **definition viewing** for the rest. No create/edit/drop/execute.

---

## 1. Summary

Today the sidebar and the overview grid only show **base tables**. A real MySQL/Postgres database is a graph of many object kinds — views are often the most common after tables, functions and procedures encode business logic, and Postgres adds materialized views, sequences, and enums on top. Without surfacing them, users can't even tell those objects exist, let alone read them.

This spec adds a backend `ListEntities` introspection call that returns every supported object kind for the active database/schema, restructures the sidebar to group entities by kind under collapsible sections, lets users browse **views** in the existing data grid, and gives **routines / triggers / sequences / enums** a read-only **Definition** tab.

### 1.1 Relationship to PRD §4

PRD §4 lists *"views/triggers/procedures management"* as out of scope. This spec stays inside that line by being strictly **read-only**: no `CREATE`, `ALTER`, `DROP`, or `CALL` UI for any non-table entity. Listing + viewing the definition is **discovery**, not management. If we ever add a "Create View" or "Execute Procedure" button, that lives in a future spec and requires explicit PRD §4 revision.

---

## 2. Motivation

- **Views are first-class for many teams** (reporting layers, permission boundaries) and currently invisible — a user opening an unfamiliar DB has no way to see them.
- **Materialized views** in Postgres look like tables on disk but behave differently; conflating or omitting them is misleading.
- **Functions / procedures** are where the business logic lives in legacy MySQL apps. A DB client that hides them sends users back to the CLI for `SHOW CREATE FUNCTION`.
- **Sequences** matter for Postgres debugging (resetting next-id, diagnosing duplicate-key bugs).
- **Triggers** are silent side-effects on tables — surfacing them helps the user reason about why a write did unexpected things.
- The introspection cost is low (a handful of `INFORMATION_SCHEMA` / `pg_catalog` queries) and the UI cost is contained (sidebar grouping + a new tab kind).

---

## 3. Current State

| Layer | File | State |
|---|---|---|
| Backend (MySQL) | `internal/mysql/entities.go` | `ListEntities` + `EntityDefinition` for views, routines, triggers, events. |
| Backend (Postgres) | `internal/postgres/entities.go` | Same for views, mat. views, routines, triggers, sequences, enums. |
| Engine interface | `internal/engine/engine.go` | `ListEntities`, `EntityDefinition` on `Engine`. |
| Wails bridge | `app.go` | Exposes both methods; bindings in `frontend/wailsjs/go/main/App.*`. |
| Sidebar | `frontend/src/components/Sidebar.tsx` | Collapsible sections per kind; unified filter; entity context menu. |
| Workspace tabs | `frontend/src/pages/Workspace.tsx` | `table`, `view`, `definition`, `sql` tab kinds wired. |
| Definition viewer | `frontend/src/components/EntityDefinition.tsx` | Read-only pane with copy button. |
| Overview | `frontend/src/components/TableOverview.tsx` | Tables only — **S2 kind filter still deferred.** |

---

## 4. Requirements

### 4.1 Must Have

- **M1 — `ListEntities` backend method.** New `Engine.ListEntities(database string) ([]Entity, error)` returning every supported object kind in one call. Shape:
  ```go
  type Entity struct {
      Name   string `json:"name"`
      Kind   string `json:"kind"`   // see M2
      Schema string `json:"schema"` // PG only; "" for MySQL
      Owner  string `json:"owner"`  // optional; empty if not cheaply available
      Extra  string `json:"extra"`  // short human label per kind (see M3)
  }
  ```
  Tables continue to be served by the existing `ListTables` (it carries size/row-count metadata that doesn't fit the generic shape). `ListEntities` returns **non-table** kinds only — tables stay on their own faster, richer path.

- **M2 — Supported kinds.** The `Kind` enum (string-typed for forward compat):

  | Kind | MySQL source | Postgres source |
  |---|---|---|
  | `view` | `INFORMATION_SCHEMA.VIEWS` | `pg_class` where `relkind='v'` |
  | `materialized_view` | — (not supported) | `pg_class` where `relkind='m'` |
  | `function` | `INFORMATION_SCHEMA.ROUTINES` where `ROUTINE_TYPE='FUNCTION'` | `pg_proc` where `prokind='f'` |
  | `procedure` | `ROUTINE_TYPE='PROCEDURE'` | `pg_proc` where `prokind='p'` |
  | `trigger` | `INFORMATION_SCHEMA.TRIGGERS` | `pg_trigger` (non-internal) |
  | `sequence` | — | `pg_class` where `relkind='S'` |
  | `event` | `INFORMATION_SCHEMA.EVENTS` | — |
  | `enum` | — | `pg_type` where `typtype='e'` |

  Kinds without a source row simply don't appear in the result. The engine is allowed to skip kinds it doesn't support — the frontend renders only kinds present in the response.

- **M3 — Per-kind `Extra` blurb.** A short, cheap label so the sidebar can show something useful without a second call:
  - `function` / `procedure` → return type / argument count (e.g. `(int, text) → bool`). Param count comes from `INFORMATION_SCHEMA.PARAMETERS` (`ORDINAL_POSITION > 0`), not a non-existent `ROUTINES.PARAMETER_COUNT` column.
  - `trigger` → the table it fires on (e.g. `on users`)
  - `sequence` → last value or `nextval` cache hint
  - `view` / `materialized_view` → blank (size belongs in the overview, not the sidebar)
  - `event` → next-run timestamp
  - `enum` → number of values (e.g. `4 values`)
  All optional — empty `Extra` is valid and the UI handles it.

- **M4 — `EntityDefinition` backend method.** `Engine.EntityDefinition(database, schema, kind, name string) (string, error)` returning the canonical CREATE statement. Maps to:
  - MySQL: `SHOW CREATE VIEW|FUNCTION|PROCEDURE|TRIGGER|EVENT …` (one path per kind)
  - Postgres: `pg_get_viewdef`, `pg_get_functiondef`, `pg_get_triggerdef`, `pg_get_indexdef`, `pg_sequence_parameters` joined to formatted output, etc.
  Returns the SQL text verbatim with whatever the engine formats it as. No frontend reformatting.

- **M5 — Sidebar grouping.** Replace the single `TABLES (n)` list with collapsible sections, one per entity kind that has at least one item. Order: **Tables → Views → Materialized Views → Functions → Procedures → Triggers → Sequences → Events → Enums.** Tables expanded by default; the rest collapsed. Section header shows `<KIND_LABEL> (count)` and a chevron. Filter input at the top filters across **all** kinds simultaneously.

- **M6 — Open a view as a data tab.** Clicking a view (or materialized view) opens a tab that behaves like a table tab: data grid + Filter Bar + paging + auto-`LIMIT 300`. The Structure sub-toggle is **hidden** for views (no editable structure), replaced by a Definition sub-toggle (M8). Read-only flag is forced on for views (no insert/update/delete UI) regardless of connection setting — views are read-only at the UI level even when the underlying engine would allow updatable views.

- **M7 — Backend treats views like tables for browsing.** `FetchRows` already builds `SELECT … FROM <ident>`; views are queryable with the same path. **No new SQL builder branch.** `internal/sqlbuilder/select.go` quotes the identifier the same way regardless of whether it's a table or view. The only difference is the engine-side `ListEntities` having tagged it `view`, which the **frontend** uses to suppress mutation UI.

- **M8 — Definition tab.** Functions, procedures, triggers, sequences, events, and enums open into a new `definition` tab kind. Layout: a read-only Monaco/textarea pane showing the result of `EntityDefinition`, plus a one-line header with the entity's name, kind, schema (PG), and a "Copy" button. No edit / no execute. For **views and materialized views**, the Definition sub-toggle lives inside the table-style tab alongside `data` (M6).

- **M9 — Right-click parity (limited).** Each entity row in the sidebar gets a context menu. The only universally-safe actions:
  - **Open** (default action)
  - **Open Definition** (where applicable)
  - **Copy CREATE statement** (calls `EntityDefinition`, writes to clipboard)
  No Drop / Truncate / Execute — out of scope (§1.1).

### 4.2 Should Have

- **S1 — Entity icons.** Each kind has a distinct lucide icon in the sidebar (e.g. `Table2`, `Eye` for views, `Layers` for materialized views, `FunctionSquare`, `PlaySquare` for procedures, `Zap` for triggers, `Hash` for sequences, `Calendar` for events, `ListTree` for enums). Helps scan a long mixed list.

- **S2 — Overview kind filter.** Extend the workspace TableOverview empty-state grid (see `workspace-table-overview.md`) with a segmented control across the top: `Tables | Views | Functions | …`. Defaults to Tables; switching segments renders a kind-appropriate grid (views: name + definition first line; functions: name + signature; etc.). If this turns out to be more than a few hours, defer to a follow-up spec and ship M1–M9 first.

- **S3 — Materialized-view freshness hint.** For PG materialized views, the sidebar `Extra` shows `stale` / `refreshed <relative-time>` when cheaply derivable from `pg_stat_user_tables.last_*` (optional — empty is fine).

- **S4 — Refresh after mutation.** TRUNCATE/DROP from the existing table context menu triggers `setDataVersion(v+1)`, which refetches both `ListTables` and `ListEntities`. No new wiring — just plumb the same effect dependency.

### 4.3 Could Have (deferred)

- **C1 — Search within definitions.** Grep across all routine bodies (`SHOW CREATE` / `pg_proc.prosrc`). Useful but a real feature; out of scope.
- **C2 — Execute procedure / select function.** Crosses into "management" per §1.1; needs a PRD update.
- **C3 — Editable view definition.** Same — needs PRD update.
- **C4 — Foreign tables, partitioned tables, publications, subscriptions, extensions.** Long tail; revisit when there's a concrete user need.

### 4.4 Non-Goals

- No mutation of any non-table entity (M9 / §1.1).
- No re-formatting / pretty-printing of routine source — display whatever `SHOW CREATE` / `pg_get_functiondef` returns.
- No language-aware editor for routines (PL/pgSQL highlighting is nice but not required; plain SQL highlighting from the existing editor is fine).
- No "navigate to trigger's table" / cross-links — flat list, plain UI, ship it.

---

## 5. Design

### 5.1 Backend — `Entity` DTO + engine methods

`internal/dbtypes/types.go`:
```go
type Entity struct {
    Name   string `json:"name"`
    Kind   string `json:"kind"`
    Schema string `json:"schema"`
    Owner  string `json:"owner"`
    Extra  string `json:"extra"`
}
```

`internal/engine/engine.go` (additions):
```go
ListEntities(database string) ([]dbtypes.Entity, error)
EntityDefinition(database, schema, kind, name string) (string, error)
```

`internal/mysql/introspect.go` — one query per kind, UNION'd or sequential:
- `SELECT TABLE_NAME, 'view' FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = ?`
- `SELECT ROUTINE_NAME, IF(ROUTINE_TYPE='FUNCTION','function','procedure'), … FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ?`
- `SELECT TRIGGER_NAME, 'trigger', EVENT_OBJECT_TABLE FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = ?`
- `SELECT EVENT_NAME, 'event', … FROM INFORMATION_SCHEMA.EVENTS WHERE EVENT_SCHEMA = ?`

Run them in parallel via a small `errgroup`, append into one slice, sort by `(kind, name)`. Single round trip from the user's perspective.

`internal/postgres/introspect.go` — analogous queries against `pg_class`, `pg_proc`, `pg_trigger`, `pg_type`. Skip the kinds Postgres doesn't have, populate the ones it does. `Schema` is filled in.

`EntityDefinition` is a `switch kind { ... }` dispatching to the engine-specific source query. Surface engine errors verbatim per PRD §8.

### 5.2 Wails surface

`app.go` adds two methods, returning the existing `dbtypes` shapes:
```go
func (a *App) ListEntities(database string) ([]dbtypes.Entity, error)
func (a *App) EntityDefinition(database, schema, kind, name string) (string, error)
```

`wails dev` regenerates `frontend/wailsjs/go/main/App.{d.ts,js}` and `models.ts`. Frontend imports from there as usual.

### 5.3 Frontend — sidebar restructure

`frontend/src/components/Sidebar.tsx`:
- Take a new prop `entities: Entity[]` alongside `tables`.
- Group rendering: tables in their own collapsible section (uses existing `TableSummary` rendering with row count); a second pass groups `entities` by `kind`. Each section uses a small `<Collapsible>` (shadcn) with the count in the header.
- The existing filter input runs across `tables.name` **and** `entities.name`. A section with zero filtered items hides its header entirely.
- Each entity row: icon + name + muted `Extra` text. Click → `onOpenEntity(entity)`. Right-click → menu per M9.

### 5.4 Frontend — tab kinds

`frontend/src/pages/Workspace.tsx`:
```ts
type Tab =
  | { id: string; kind: "table"; table: string; sub: "data" | "structure" }
  | { id: string; kind: "view"; name: string; schema: string; sub: "data" | "definition" }
  | { id: string; kind: "definition"; entity: Entity }
  | { id: string; kind: "sql" }
```

`openEntity(entity)` opens the right tab kind:
- `view` / `materialized_view` → `view` tab, default sub `data`.
- Everything else → `definition` tab.

The `view` tab reuses `<TableView>` with a `readOnly` prop forced true (or with mutation UI suppressed via an existing `read_only` path). The `data` sub-tab uses `FetchRows` against the view's identifier exactly like a table. The `definition` sub-tab calls `api.entityDefinition(...)` once on mount and caches the result.

### 5.5 Frontend — definition viewer

New component `frontend/src/components/EntityDefinition.tsx`:
- Props: `{ database, schema, kind, name }`.
- Effect: load definition on mount, store in state, render in a read-only code block (reuse the SQL editor's Monaco instance in read-only mode, or a styled `<pre>` for v1).
- Header: kind icon + qualified name + Copy-to-clipboard button.

---

## 6. UI / UX decisions

| Decision | Choice | Rationale |
|---|---|---|
| Group order | Tables → Views → Mat. Views → Functions → Procedures → Triggers → Sequences → Events → Enums | Frequency of use; tables and views first. |
| Default-expanded sections | Tables only | Long DBs already strain the sidebar; expanding everything explodes the list. |
| View tab kind | Distinct (`view`, not `table`) | Lets us hide Structure sub-toggle and force read-only without per-row branching inside `TableView`. |
| Definition tab | Read-only, separate from `data` | A function has no data tab; a view has both. Same `kind=definition` component works inside the view's sub-toggle and as a standalone tab. |
| No execute / no edit | Strict | Stays inside PRD §4. |

---

## 7. Edge cases

- **Permissions** — a user may see an object in the catalog but lack `SHOW VIEW` / `pg_get_functiondef` rights. `EntityDefinition` surfaces the engine error verbatim; the UI shows it inline in the Definition pane. Do not retry or hide.
- **Invalid (broken) views** — MySQL marks them with `CHECK_OPTION = 'INVALID'` and selecting from them fails. Let the failure propagate via the normal `FetchRows` error path; show the engine error in the data grid's error state.
- **Massive routine bodies** (10k+ lines of PL/pgSQL) — load synchronously, no pagination. If this becomes a real problem, defer to C1's territory.
- **Triggers on the same table** — multiple triggers list separately with the same `Extra: "on users"`. That's fine; the name disambiguates.
- **Schema-qualified entities (PG)** — when the user switches schema, both `ListTables` and `ListEntities` re-fetch (existing `[namespace, dataVersion]` effect). Entity tabs key on `${schema}.${name}` so the same name in two schemas doesn't collide.
- **Materialized views in MySQL / events in Postgres** — kind absent from the response; section header simply doesn't render. No "not supported" placeholder needed.
- **Mutation count on overview** — TableOverview keeps showing tables only; entities don't have size/row-count and don't belong in that grid (unless S2 ships).
- **Read-only flag interaction** — a connection set to `read_only` already suppresses mutation; views additionally suppress it even when the connection is writable. The two paths AND together, no surprises.

---

## 8. Files to change

| File | Change |
|---|---|
| `internal/dbtypes/types.go` | Add `Entity` struct. |
| `internal/engine/engine.go` | Add `ListEntities` and `EntityDefinition` to the interface. |
| `internal/mysql/introspect.go` | Implement both — one query per kind, parallelized; switch-based definition fetch. |
| `internal/postgres/introspect.go` | Same, against `pg_catalog`. |
| `app.go` | Expose `ListEntities` and `EntityDefinition` as Wails methods. |
| `frontend/wailsjs/go/...` | Auto-regenerated. |
| `frontend/src/lib/types.ts` | Mirror `Entity`. |
| `frontend/src/lib/api.ts` | Add `listEntities`, `entityDefinition` wrappers. |
| `frontend/src/components/Sidebar.tsx` | Accept `entities`; render collapsible per-kind sections; unified filter; per-kind icons; entity context menu. |
| `frontend/src/components/EntityDefinition.tsx` *(new)* | Read-only definition viewer with copy button. |
| `frontend/src/pages/Workspace.tsx` | Load entities alongside tables; widen `Tab` union; route `openEntity` to view-tab or definition-tab; pass entities into Sidebar; force read-only for view tabs. |
| `frontend/src/pages/TableView.tsx` | Accept a `readOnly` override prop (or a `kind: "table" \| "view"` discriminator) that hides insert/edit/delete UI when set. |
| `docs/specs/workspace-table-overview.md` | (Optional, S2) Note the segmented-control extension; otherwise unchanged. |

No SQL builder, no destructive-op classifier, no transaction-mode wiring changes.

---

## 9. Acceptance criteria

1. The sidebar shows collapsible sections per entity kind present in the active database: Tables (expanded by default), Views, Mat. Views, Functions, Procedures, Triggers, Sequences, Events, Enums. Sections with zero items don't render.
2. The Filter Tables input filters across all kinds; section headers and counts update accordingly.
3. Clicking a view opens a tab whose `Data` view lists the view's rows via the existing data grid (paging, filters, auto-LIMIT 300). Insert / Edit / Delete affordances are not present.
4. The view tab has a Definition sub-toggle that shows the view's `SHOW CREATE VIEW` / `pg_get_viewdef` text.
5. Clicking a function, procedure, trigger, sequence, event, or enum opens a Definition tab showing the canonical CREATE statement.
6. Right-clicking any entity shows Open, Open Definition (where applicable), and Copy CREATE statement — nothing else.
7. Copy CREATE statement writes the result of `EntityDefinition` to the clipboard.
8. Switching database (MySQL) or schema (Postgres) refetches `ListEntities`; switching back restores entities for that namespace.
9. A successful TRUNCATE/DROP on a table also refreshes the entity list (in case the table's triggers vanished).
10. An entity the user cannot inspect surfaces the engine error verbatim inside the Definition pane (no silent failure).
11. PRD §4 compliance: no UI exists to create, alter, drop, refresh, or execute any non-table entity.

---

## 10. Test notes

- **Manual:**
  - MySQL DB containing 1 view, 1 updatable view, 1 function, 1 procedure with arguments, 1 trigger, 1 event. Confirm each lists, opens, and shows its definition.
  - Postgres DB with 1 view, 1 materialized view, 1 SQL function, 1 PL/pgSQL function with cursors, 1 sequence at a non-default cache, 1 trigger, 1 enum with 3 values.
  - Negative: a routine the user doesn't own — confirm the error surfaces verbatim.
- **Optional unit (Go):** A `mysql.ListEntities` test against a docker MySQL with a known schema; same for Postgres. Skip in CI if those containers aren't available locally — the queries are short and easy to read.

---

## 11. Out of scope (restated)

Mutation of any non-table entity (create/alter/drop/refresh/execute), in-app routine editing, cross-entity navigation, full-text search across routine bodies, and richer entity-aware overview grids beyond §4.2 S2. Anything not listed in §4.1/§4.2 is deferred per the PRD's "PRD is the contract" rule and the §1.1 read-only boundary.
