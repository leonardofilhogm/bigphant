# Spec — Order By on Data-Table Columns

**Status:** Proposed
**Owner:** TBD
**Parent contract:** `docs/prd.md` (this spec refines Browsing behaviour; PRD §3, §8 "Browsing")
**Scope:** Table-browse view only (`TableView` → `DataGrid`). Does **not** touch the raw SQL editor.

---

## 1. Summary

Let users sort the table-browse grid by clicking a column header. The grid opens
sorted by `id` ascending by default, clicking a header sorts by that column, and
clicking again toggles ascending ⇄ descending. The active sort column shows a
direction icon (↑ asc / ↓ desc) in its header.

This is wired through the **existing** server-side sort path — no SQL is built on
the frontend, honoring the PRD hard constraint that all browse queries are built
by `internal/sqlbuilder`.

---

## 2. Motivation

The table-browse grid currently renders rows in whatever physical/scan order
MySQL returns, which is unstable across reloads and pagination. Sorting is the
single most common grid interaction in a DB client (TablePlus, Beekeeper). The
backend already supports it — this spec closes the frontend gap.

---

## 3. Current State (what already exists)

| Layer | File | State |
|---|---|---|
| SQL builder | `internal/sqlbuilder/select.go` | ✅ `BuildSelect` emits `ORDER BY <quoted col> ASC\|DESC` when `OrderBy != ""`. Identifier is backtick-quoted; direction is validated to `ASC`/`DESC`. **No change needed.** |
| Go bridge | `internal/mysql/query.go` `FetchRows` | ✅ Passes the request straight through. **No change needed.** |
| Request type (Go) | `sqlbuilder.FetchRowsRequest` | ✅ Has `OrderBy` / `OrderDir` (`order_by` / `order_dir`). |
| Request type (TS) | `frontend/src/lib/types.ts` `FetchRowsRequest` | ✅ Has `order_by: string` / `order_dir: string`. |
| Caller | `frontend/src/pages/TableView.tsx` | ❌ Hardcodes `order_by: ""`, `order_dir: ""`. **Gap.** |
| Header UI | `frontend/src/components/DataGrid.tsx` | ❌ `<th>` is static — no click handler, no sort icon. **Gap.** |

**Conclusion:** Frontend-only change. No Go, no `wails` binding regeneration.

---

## 4. Requirements

### 4.1 Must Have

- **M1 — Default sort.** On first load of a table, the grid is sorted ascending
  by the column named `id` (case-insensitive) when one exists.
  - **M1a — Fallback:** if there is no `id` column, default to the first
    primary-key column (already fetched via `api.describeTable` →
    `primary_key`).
  - **M1b — No-key fallback:** if neither exists, send no `ORDER BY` (empty
    `order_by`) — unsorted, current behaviour.
- **M2 — Click to sort.** Clicking a column header sorts the grid by that column
  ascending.
- **M3 — Toggle direction.** Clicking the **already-active** sort column toggles
  the direction: asc → desc → asc. (Two-state toggle, not a three-state cycle —
  per the request "order by asc or desc".)
- **M4 — Direction icon.** The active sort column header displays an arrow icon
  indicating direction: up for ASC, down for DESC. Non-active columns show no
  icon (or a muted neutral affordance — see §6).
- **M5 — Server-side only.** Sorting re-runs the query through
  `api.fetchRows({ order_by, order_dir })`. The frontend never sorts in JS and
  never builds SQL. Sorting applies across the full result set, not just the
  loaded page.
- **M6 — Pagination reset.** Changing the sort column or direction resets
  `offset` to 0 (you're looking at a new ordering; page 1 is the right anchor).

### 4.2 Should Have

- **S1 — Sort survives refresh/mutation.** ⌘R refresh and post-mutation reloads
  preserve the active sort (it's part of the query inputs, so this falls out of
  the effect dependency wiring naturally).
- **S2 — Sort resets on table switch.** Switching tables resets to the default
  (M1) for the new table, consistent with the existing per-table state reset.

### 4.3 Could Have (out of scope unless trivial)

- **C1** — Multi-column sort (shift-click to add secondary sort). **Deferred** —
  `BuildSelect` only supports one `ORDER BY` term today; adding multi-sort is a
  backend change and is out of scope for this spec.
- **C2** — Persisting per-table sort preference to `settings.json`. **Deferred.**

### 4.4 Non-Goals

- No frontend SQL construction (PRD hard constraint).
- No sorting of staged/pending duplicate rows — they always render appended
  after the real (sorted) rows, as today.
- No change to the raw SQL editor (it is explicitly not auto-ordered, mirroring
  the auto-LIMIT rule in the PRD).

---

## 5. Design

### 5.1 Sort state (TableView)

Add one piece of state:

```ts
type SortDir = "ASC" | "DESC"
const [sort, setSort] = useState<{ column: string; dir: SortDir } | null>(null)
```

`null` means "no explicit order" (M1b). Otherwise it drives the request.

### 5.2 Computing the default (M1)

The default depends on the column list (`result.columns`) and the primary key
(`primaryKey`), both already available. Resolve the default once columns are
known and `sort` is still `null`:

```ts
function defaultSortColumn(cols: Column[], pk: string[]): string | null {
  const id = cols.find((c) => c.name.toLowerCase() === "id")
  if (id) return id.name            // M1: prefer a column literally named "id"
  if (pk.length > 0) return pk[0]    // M1a: else first primary-key column
  return null                        // M1b: else unsorted
}
```

Apply it where the column set/PK first becomes known (e.g. in the rows-fetch
`.then` after `setVisible`, guarded by `sort == null`, or in the
`describeTable` effect once columns are available). Set
`sort = { column, dir: "ASC" }` so the next fetch carries the order.

> **Sequencing note:** `primary_key` arrives from `describeTable` and columns
> arrive from `fetchRows` — two async paths. Resolve the default after both have
> resolved at least once. Simplest: compute it inside the fetch `.then` using the
> latest `primaryKey` (it's in state by then for any non-trivial table), and only
> when `sort == null`. The first fetch may run unsorted for a beat; that's
> acceptable, or pre-resolve the `id` case from columns alone (PK not required
> for the common `id` path).

### 5.3 Wiring into the fetch

In the rows-fetch effect, replace the hardcoded empties:

```ts
api.fetchRows({
  database,
  table,
  filters: appliedFilters,
  limit: pageSize,
  offset,
  order_by: sort?.column ?? "",
  order_dir: sort?.dir ?? "",
})
```

Add `sort` to the effect's dependency array so a sort change refetches:

```ts
}, [database, table, offset, pageSize, appliedFilters, reloadKey, dataVersion, sort])
```

### 5.4 Header click handler (M2/M3/M6)

```ts
function onSort(colName: string) {
  setOffset(0) // M6
  setSort((prev) =>
    prev?.column === colName
      ? { column: colName, dir: prev.dir === "ASC" ? "DESC" : "ASC" } // M3 toggle
      : { column: colName, dir: "ASC" }                               // M2 new column
  )
}
```

Pass `sort` and `onSort` into `DataGrid` via new props.

### 5.5 Table-switch reset (S2)

The existing per-table reset effect (keyed on `[database, table]`) already
resets `offset`, `filters`, `visible`, etc. Add `setSort(null)` there so the new
table re-resolves its own default per §5.2.

### 5.6 DataGrid header (M4)

Extend `DataGridProps`:

```ts
sort?: { column: string; dir: "ASC" | "DESC" } | null
onSort?: (colName: string) => void
```

Make each `<th>` a clickable sort control. Render the direction icon only on the
active column:

```tsx
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
// ...
<th
  key={col.name}
  onClick={() => onSort?.(col.name)}
  className="... cursor-pointer select-none hover:bg-muted/80 group"
  aria-sort={sort?.column === col.name ? (sort.dir === "ASC" ? "ascending" : "descending") : "none"}
>
  <span className="inline-flex items-center gap-1">
    <span className="text-foreground">{col.name}</span>
    <span className="font-normal opacity-60">{col.type}</span>
    {sort?.column === col.name ? (
      sort.dir === "ASC"
        ? <ArrowUp className="size-3" />
        : <ArrowDown className="size-3" />
    ) : (
      <ChevronsUpDown className="size-3 opacity-0 group-hover:opacity-40" />
    )}
  </span>
</th>
```

- Active column → solid `ArrowUp`/`ArrowDown`.
- Inactive column → faint `ChevronsUpDown` on hover, hinting the header is
  sortable (optional; drop it for a cleaner look — see §6).
- `aria-sort` set for accessibility.

---

## 6. UI / UX decisions

| Decision | Choice | Rationale |
|---|---|---|
| Toggle states | Two (asc ⇄ desc), no "unsorted" third state | Matches the request and TablePlus; there's always *a* sort once you've clicked. Default sort (M1) covers the "initial" ordering. |
| Inactive-column hint | Faint hover icon (`ChevronsUpDown`) | Discoverability; remove if visual noise is a concern. |
| Active icon | `ArrowUp` (ASC) / `ArrowDown` (DESC), `size-3` | Reads as "smallest→largest at top" for ASC. |
| Click target | Whole `<th>` | Larger target; checkbox column header is excluded. |

---

## 7. Edge cases

- **No primary key & no `id`** → no default sort (M1b); headers still clickable.
- **Sort column hidden via ColumnPicker** → the column may not be visible in the
  grid but the order still applies. Acceptable; optionally surface the active
  sort in the toolbar (out of scope).
- **Filtered view** → `ORDER BY` composes with `WHERE` in `BuildSelect`; no
  special handling.
- **Pagination** → because sorting is server-side over the full set, paging
  through a sorted result is correct. `offset` resets to 0 on sort change (M6).
- **JSON / blob columns** → MySQL sorts them per its own rules; we don't special-
  case. No crash risk (identifier is quoted server-side).
- **Injection** → header click sends a real column name from `result.columns`;
  `BuildSelect` backtick-quotes it regardless. No new attack surface.
- **Staged (pending) rows** → unaffected; always appended after sorted real rows.

---

## 8. Files to change

| File | Change |
|---|---|
| `frontend/src/pages/TableView.tsx` | Add `sort` state; `defaultSortColumn` helper; resolve default after columns/PK known; pass `order_by`/`order_dir` into `fetchRows`; add `sort` to fetch deps; `onSort` handler with offset reset; `setSort(null)` in table-switch reset; pass `sort`/`onSort` to `DataGrid`. |
| `frontend/src/components/DataGrid.tsx` | Add `sort`/`onSort` props; make `<th>` clickable; render direction icon + `aria-sort`. |

No backend, no Go binding regeneration, no `internal/**` changes.

---

## 9. Acceptance criteria

1. Opening a table with an `id` column shows rows sorted by `id` ascending, with
   an up-arrow on the `id` header.
2. A table with a non-`id` primary key opens sorted by that PK column ascending.
3. A table with no PK and no `id` opens unsorted; no header shows an arrow.
4. Clicking a column header sorts ascending and shows the up-arrow on it (and
   removes the arrow from any previously-sorted header).
5. Clicking the active header again flips to descending (down-arrow) and re-runs
   the query.
6. Changing sort returns the user to page 1 (offset 0).
7. ⌘R refresh and post-edit reloads keep the active sort.
8. Switching tables resets the sort to the new table's default.
9. The generated SQL (visible via the existing `ResultSet.SQL`) contains a single
   `ORDER BY \`col\` ASC|DESC` clause built server-side; no SQL is constructed in
   the frontend.

---

## 10. Test notes

- **Manual (PoC default):** verify against a table with `id`, a table with a
  composite/non-`id` PK, and a keyless table (or a view-like result). Confirm
  icon state, direction toggle, offset reset, and SQL string in devtools.
- **Optional unit (Go):** `BuildSelect` already merits a `sqlbuilder` test —
  add cases asserting `ORDER BY` placement after `WHERE` and before
  `LIMIT/OFFSET`, ASC/DESC normalization (e.g. `desc` → `DESC`), and identifier
  quoting of a column name containing a backtick. (Tests optional per PRD, but
  this is cheap insurance given the path is now user-reachable.)

---

## 11. Out of scope (restated)

Multi-column sort, persisted sort preferences, sort affordances for the raw SQL
editor, and any new backend method. Anything not listed in §4.1/§4.2 is deferred
per the PRD's "PRD is the contract" rule.
