# Spec — Table Structure Editing (server-built DDL)

**Status:** Ready (M1–M10 implemented; S2–S7 partial — constraints UI deferred)
**Owner:** TBD
**Parent contract:** `docs/prd.md` (refines "inspect/alter table structure"; PRD §3 Must/Should,
§8 method signatures, §9 destructive-op flow) and `docs/specs/plans-and-licensing.md`
(`modify_schema` feature gate)
**Scope:** Editing the structure of an **existing** table — columns, indexes, and constraints —
through a structured, server-built `ALTER TABLE` path in `StructureView`. **Does not** create or
drop tables/databases, and does not touch the data grid or raw SQL editor behaviour.

---

## 1. Summary

Today the Structure tab is **read-only with stubbed edit buttons**: "Add column" and the
per-row "Modify" (pencil) buttons only `toast.info("… not wired")`, and the only operation that
does anything — "Drop column" — **builds the `ALTER TABLE … DROP COLUMN` string on the frontend**
and routes it through the raw-SQL execution path. That is both incomplete and a **violation of the
PRD hard constraint** that the frontend constructs SQL *only* in the raw-SQL editor textarea
(`CLAUDE.md` / PRD §8).

This spec makes table-structure editing real and contract-compliant. The frontend sends a
**structured `AlterTableRequest`** (a list of typed operations); a new server-side
`internal/sqlbuilder` DDL builder turns it into dialect-correct, identifier-quoted SQL; the change
is **classified for destructiveness server-side**, **gated behind the `modify_schema` license
feature**, previewed back to the UI, and executed through the engine with **MySQL errors surfaced
verbatim**. After a successful change the structure view refreshes.

Supported operations (this spec): **add / modify / rename / drop columns**, **add / drop indexes**,
and **add / drop constraints** (unique, primary key, foreign key, and — Could — check), plus the
common companions the request hinted at ("etc."): **rename table**, **set/drop column default**,
and **column reordering** (MySQL `FIRST`/`AFTER`).

---

## 2. Motivation

- **Close the feature.** Structure editing is a PRD Must/Should ("inspect/**alter** table
  structure") and is already license-gated (`FeatModifySchema`) and surfaced in the UI — only the
  wiring is missing.
- **Fix a contract violation.** The frontend currently hand-builds `ALTER TABLE … DROP COLUMN`
  with template literals. All non-raw SQL must be built server-side with proper quoting; a
  structured request removes the injection surface and the dialect guesswork from the client.
- **Reliable destructiveness.** Classifying a *structured request* (op kinds) is far more robust
  than regex-matching a SQL string, so the confirm/preview gate becomes trustworthy for DDL.

---

## 3. Current State (what already exists)

| Layer | File | State |
|---|---|---|
| Structure UI | `frontend/src/pages/StructureView.tsx` | ✅ Add/edit/drop columns and add/drop indexes via structured requests + `SchemaAlterModal` preview. License gate via `canModifySchema`. Constraints section **deferred** (needs FK introspection). |
| Preview modal | `frontend/src/components/SchemaAlterModal.tsx` | ✅ Shows server-previewed SQL; destructive ops require explicit confirm. |
| Column / index forms | `frontend/src/components/ColumnFormDialog.tsx`, `IndexFormDialog.tsx` | ✅ Structured editors; no client-built DDL. |
| Workspace wiring | `frontend/src/pages/Workspace.tsx` | ✅ Passes `driver`, `onStructureChange` (tab rename + `dataVersion` bump). **No longer** routes structure edits through `runRawSQL`. |
| Introspection | `App.DescribeTable` → `dbtypes.TableStructure` | ✅ Read path exists; lacks foreign-key / constraint metadata (blocks Constraints UI). |
| SQL builder | `internal/sqlbuilder/ddl.go` | ✅ `AlterTableRequest`, `BuildAlterTable` (MySQL + Postgres), type-token validation. |
| Destructive classifier | `internal/sqlbuilder/safety.go` | ✅ `ClassifyAlter(req)` (request-level) + existing regex `Classify` for raw SQL. |
| Engine contract | `internal/engine/engine.go` | ✅ `AlterTable(req)` on `Engine`. |
| Connectors | `internal/mysql/ddl.go`, `internal/postgres/ddl.go` | ✅ Build + execute via dialect. |
| License gate | `app_ddl.go` | ✅ `PreviewAlterTable` / `AlterTable` gated on `FeatModifySchema`; `requireWrite()` for read-only connections. |
| Confirmation gate | `internal/apperror/apperror.go` | ✅ `ConfirmationRequired` when destructive and `confirmed=false`. |
| App methods | `app_ddl.go` | ✅ `PreviewAlterTable`, `AlterTable(req, confirmed)`. |
| Types (TS) | `frontend/src/lib/types.ts`, `frontend/wailsjs/go/models.ts` | ✅ `AlterTableRequest`, `AlterOp`, `ColumnDef`, `IndexDef`, `AlterPreview`. |
| API wrapper | `frontend/src/lib/api.ts` | ✅ `previewAlterTable`, `alterTable`. |

**Remaining gaps:** Constraints section (S2/S3) needs extended `DescribeTable` FK metadata; rename-table toolbar (S5); unit test coverage beyond smoke tests in `ddl_test.go`.

---

## 4. Requirements

### 4.1 Must Have

- **M1 — Add column.** Add a column with: name, type (free-text type string, e.g.
  `VARCHAR(255)`, `INT`, `DECIMAL(10,2)`), nullability, default (none / literal / `NULL` /
  expression like `CURRENT_TIMESTAMP`), `AUTO_INCREMENT` (MySQL), comment, and position
  (`FIRST` / `AFTER <col>`, MySQL).
- **M2 — Modify column.** Change an existing column's type, nullability, default,
  auto-increment, and comment. (MySQL emits `MODIFY`; rename uses `CHANGE` — see M3.)
- **M3 — Rename column.** Rename a column (MySQL `CHANGE`, or `RENAME COLUMN` where the server
  version supports it; Postgres `RENAME COLUMN`).
- **M4 — Drop column.** Drop a column. **Destructive → confirm** (§4.x, PRD §9).
- **M5 — Add index.** Create a (possibly multi-column) secondary index, with an optional
  `UNIQUE` flag and an optional explicit name (auto-named if omitted).
- **M6 — Drop index.** Drop a named index. **Destructive → confirm.**
- **M7 — Server-built DDL only.** The frontend sends a **structured `AlterTableRequest`**;
  **all SQL is built in `internal/sqlbuilder` server-side** with dialect-correct identifier
  quoting. The frontend **never** constructs DDL strings. This replaces the current
  frontend-built `DROP COLUMN`.
- **M8 — Preview before apply.** Before executing, the UI can request the **server-generated
  SQL** (`PreviewAlterTable`) and show it (read-only) so the user sees exactly what will run.
- **M9 — License + destructive gate.** Structured DDL is gated behind `FeatModifySchema`
  (reusing the existing gate). Operations classified destructive (any `drop_*`, plus a
  `modify_column` that removes nullability or shrinks a type) require explicit user confirmation
  with the previewed SQL; they are **never** executed silently. Non-Pro users hit
  `onPlanRequired` (already wired).
- **M10 — Verbatim errors + refresh.** Engine/MySQL errors are surfaced verbatim via the
  `AppError{Code, Message, SQL}` shape (PRD §8). On success the Structure view re-runs
  `DescribeTable` and reflects the new shape; the data grid/table list refresh as needed.

### 4.2 Should Have

- **S1 — Add / drop UNIQUE constraint.** Add a unique constraint (index-backed) and drop it.
- **S2 — Add / drop PRIMARY KEY.** Add a primary key over one or more columns; drop the primary
  key. Both **destructive/structural → confirm**.
- **S3 — Add / drop FOREIGN KEY.** Add a foreign-key constraint (columns → ref table/columns,
  with `ON DELETE` / `ON UPDATE` actions) and drop it by name.
  > **Scope note:** PRD §4 lists "**FK navigation**" (click-through between related rows) as out
  > of scope — that is a *browsing* feature, distinct from *managing* FK constraints, which is a
  > structural edit the user explicitly asked for ("add constraints"). Treated in-scope here;
  > flagged for owner confirmation.
- **S4 — Set / drop default.** Standalone "set default" / "drop default" on an existing column
  without restating its full type (Postgres `ALTER COLUMN … SET/DROP DEFAULT`; MySQL `ALTER
  COLUMN … SET/DROP DEFAULT`).
- **S5 — Rename table.** Rename the current table (MySQL `RENAME TABLE` / `ALTER … RENAME`;
  Postgres `ALTER TABLE … RENAME TO`). Update the open-tab/table-list state after success.
- **S6 — Column reorder.** Move a column `FIRST` / `AFTER <col>` (MySQL only; no-op/omitted for
  Postgres, which has no stable column reordering).
- **S7 — Postgres parity.** The DDL builder is **dialect-aware**: MySQL and Postgres each emit
  valid syntax for M1–M6/S1–S5 (e.g. `MODIFY` vs `ALTER COLUMN … TYPE`, `AUTO_INCREMENT` vs
  identity/serial, `CHANGE` vs `RENAME COLUMN`). Where an engine cannot express an operation, the
  builder returns a clear, surfaced error rather than wrong SQL.

### 4.3 Could Have (out of scope unless trivial)

- **C1 — CHECK constraints.** Add/drop `CHECK` constraints.
- **C2 — Multi-op batching.** Combine several operations into a single `ALTER TABLE a, b, c`
  statement (one round-trip, atomic per engine semantics). The request model is already a list;
  this is the natural extension once single-op works.
- **C3 — Table-level attributes.** Storage engine (MySQL), table comment, charset/collation,
  `AUTO_INCREMENT` seed.
- **C4 — Generated/virtual columns**, column charset/collation, spatial/fulltext index types.

### 4.4 Non-Goals

- **No `CREATE TABLE` / `DROP TABLE` / database create-delete from this UI** (table creation is a
  separate feature; DB create/delete is PRD §4 out-of-scope).
- No views/triggers/procedures management, no schema diff/migration generation (PRD §4).
- **No frontend SQL construction** for DDL (M7). The raw SQL editor remains the only place the
  user types SQL directly, and it keeps its own existing `IsSchemaDDL` gate.
- No online/lock-aware migration tooling (`pt-online-schema-change`, `ALGORITHM`/`LOCK` hints) —
  Could-tier at best, deferred.

---

## 5. Design

### 5.1 Structured request model (shared shape)

A single request carries an ordered list of typed operations. Go (`dbtypes` or
`sqlbuilder`) and TS mirror each other.

```go
type AlterTableRequest struct {
	Database string     `json:"database"`
	Table    string     `json:"table"`
	Ops      []AlterOp  `json:"ops"`
}

type AlterOp struct {
	Kind string `json:"kind"` // see enum below
	// column ops
	Column   *ColumnDef `json:"column,omitempty"`   // add_column / modify_column
	OldName  string     `json:"old_name,omitempty"` // rename_column / drop_column
	NewName  string     `json:"new_name,omitempty"` // rename_column / rename_table
	Position string     `json:"position,omitempty"` // "FIRST" | "AFTER `col`" (MySQL)
	// index / constraint ops
	Index      *IndexDef      `json:"index,omitempty"`       // add_index / add_unique
	ForeignKey *ForeignKeyDef `json:"foreign_key,omitempty"` // add_foreign_key
	Name       string         `json:"name,omitempty"`        // drop_index / drop_constraint / drop_foreign_key
	Columns    []string       `json:"columns,omitempty"`     // add_primary_key
	Check      string         `json:"check,omitempty"`       // add_check (C1)
}

type ColumnDef struct {
	Name          string  `json:"name"`
	Type          string  `json:"type"`            // raw type token, validated (§5.5)
	Nullable      bool    `json:"nullable"`
	HasDefault    bool    `json:"has_default"`
	Default       string  `json:"default"`         // literal/expr when HasDefault
	DefaultIsExpr bool    `json:"default_is_expr"` // CURRENT_TIMESTAMP etc. (no quoting)
	AutoIncrement bool    `json:"auto_increment"`
	Comment       string  `json:"comment"`
}

type IndexDef struct {
	Name    string   `json:"name"`   // optional; engine/builder names if empty
	Columns []string `json:"columns"`
	Unique  bool     `json:"unique"`
}

type ForeignKeyDef struct {
	Name       string   `json:"name"`
	Columns    []string `json:"columns"`
	RefTable   string   `json:"ref_table"`
	RefColumns []string `json:"ref_columns"`
	OnDelete   string   `json:"on_delete"` // "", "CASCADE", "SET NULL", "RESTRICT", "NO ACTION"
	OnUpdate   string   `json:"on_update"`
}
```

**Op kinds:** `add_column`, `modify_column`, `rename_column`, `drop_column`, `add_index`,
`drop_index`, `add_unique`, `add_primary_key`, `drop_primary_key`, `add_foreign_key`,
`drop_foreign_key`, `drop_constraint`, `set_default`, `drop_default`, `rename_table`,
`add_check` (C1).

### 5.2 DDL builder (`internal/sqlbuilder/ddl.go`, new)

```go
// BuildAlterTable turns a structured request into one or more DDL statements for
// the given dialect, plus a destructiveness verdict. It NEVER interpolates user
// values into SQL except through dialect identifier quoting / literal quoting.
func BuildAlterTable(d Dialect, req AlterTableRequest) (stmts []string, destructive bool, err error)
```

- Each op maps to a dialect-specific clause/statement. MySQL batches clauses into one
  `ALTER TABLE … a, b, c` (C2); Postgres mostly can too, but `rename_table` and some ops are
  separate statements — the builder returns a `[]string` to accommodate both.
- **Identifier quoting** uses `Dialect.QuoteIdent` / `Qualified` (backticks vs double-quotes).
- **Type tokens** (`ColumnDef.Type`) are validated against an allowlist/regex (§5.5), not quoted
  as identifiers (they aren't identifiers). **Default literals** are quoted as SQL string/number
  literals unless `DefaultIsExpr`.
- Dialect divergence examples handled inside the builder:
  - modify: MySQL `MODIFY COLUMN \`c\` <type> [NULL|NOT NULL] [DEFAULT …] …`; Postgres splits
    into `ALTER COLUMN "c" TYPE …`, `ALTER COLUMN "c" SET/DROP NOT NULL`, `… SET/DROP DEFAULT`.
  - rename column: MySQL `CHANGE \`old\` \`new\` <type>` (type required) or `RENAME COLUMN`
    (8.0+); Postgres `RENAME COLUMN "old" TO "new"`.
  - auto-increment: MySQL `AUTO_INCREMENT`; Postgres → identity/serial (or error if not
    expressible for a plain modify — S7).
  - position (`FIRST`/`AFTER`): MySQL only; ignored/omitted for Postgres (S6).

### 5.3 Request-level destructiveness (`internal/sqlbuilder/safety.go`)

Add a structured classifier — more reliable than regex for DDL:

```go
// ClassifyAlter reports whether any op in the request is destructive.
func ClassifyAlter(req AlterTableRequest) bool {
	for _, op := range req.Ops {
		switch op.Kind {
		case "drop_column", "drop_index", "drop_primary_key",
			"drop_constraint", "drop_foreign_key", "drop_default":
			return true
		case "modify_column":
			// narrowing nullability is data-lossy if existing NULLs; conservative.
			if op.Column != nil && !op.Column.Nullable {
				return true
			}
		}
	}
	return false
}
```

Per `CLAUDE.md`: **when in doubt, classify destructive** (false positive over false negative).
`rename_table` is structural but not data-lossy — treat as **confirm-worthy** at the UI layer
(it can break app references) without marking it strictly destructive; owner's call. The existing
regex `Classify`/`IsSchemaDDL` remain for the raw-SQL editor path, unchanged.

### 5.4 Engine + App methods

**Engine** (`internal/engine/engine.go`) gains:

```go
// AlterTable executes structured DDL. The connector builds SQL via sqlbuilder
// with its own dialect, runs it (optionally in a tx), and returns rows-affected/0.
AlterTable(req sqlbuilder.AlterTableRequest) (dbtypes.RawResult, error)
```

Connectors (`internal/mysql`, `internal/postgres`) implement it by calling
`sqlbuilder.BuildAlterTable(<dialect>, req)` and executing the returned statement(s).

**App** (`app.go` / new `app_ddl.go`) exposes two Wails methods:

```go
// PreviewAlterTable builds (but does not run) the DDL for display (M8).
func (a *App) PreviewAlterTable(req sqlbuilder.AlterTableRequest) (AlterPreview, error)
// returns { SQL []string; Destructive bool }

// AlterTable validates, gates, and executes (M9/M10).
func (a *App) AlterTable(req sqlbuilder.AlterTableRequest, confirmed bool) (mysql.RawResult, error)
```

`AlterTable` flow:
1. `requireConn()`.
2. License gate: `a.gateLicense(a.licenseSvc.Require(license.FeatModifySchema))` (mirrors the
   `ExecuteRaw` schema-DDL gate). Non-Pro → `PlanRequired`-style error → `onPlanRequired` in UI.
3. `requireWrite()` (read-only connection guard, like the DML methods).
4. Build via `sqlbuilder.BuildAlterTable` and classify via `ClassifyAlter`.
5. If destructive and `!confirmed` → return `apperror.ConfirmationRequired` with the
   preview SQL joined by `;\n` (code `ConfirmationRequired`; UI should pass `confirmed=true`
   after the user accepts the preview modal).
6. Execute through `conn.AlterTable(req)`; surface errors verbatim (M10).

> **Note:** `PreviewAlterTable` lets the UI show SQL up front; the `confirmed` round-trip in
> `AlterTable` is what actually enforces the gate. Both build server-side — the preview is
> authoritative, not a client reconstruction.

### 5.5 Validation (defense in depth)

- **Identifiers** (names) are accepted as-is but always emitted via `QuoteIdent` (handles
  embedded quotes/backticks) — no interpolation.
- **Type tokens** validated against a permissive regex/allowlist (letters, digits, spaces,
  parens, commas, `unsigned`, etc.) to reject obvious injection like `INT; DROP TABLE`. Unknown
  types still pass if they match the shape; the engine ultimately validates and errors are
  surfaced verbatim.
- **Referential actions** (`OnDelete`/`OnUpdate`) validated against the fixed set.
- **Empty op list** / missing required fields per op kind → builder error before execution.

### 5.6 Frontend (`StructureView.tsx` + dialogs)

Replace the stub buttons and the frontend-built `DROP COLUMN` with structured calls:

- **Add column** → `ColumnFormDialog` (name, type, nullable, default mode, auto-increment,
  comment, position) → build `AlterTableRequest{ops:[{kind:"add_column", column}]}` →
  `api.previewAlterTable` (show SQL) → `api.alterTable(req, confirmed)`.
- **Edit column** (pencil) → same dialog pre-filled; emits `modify_column` (+ `rename_column`
  if the name changed). Narrowing nullability triggers the destructive confirm.
- **Drop column** (trash) → `drop_column` op → preview → **confirm dialog** (destructive).
- **Indexes section** → "Add index" (`IndexFormDialog`: columns multiselect, unique, optional
  name) and per-row "Drop index" (`drop_index`, confirm).
- **New Constraints section** → render PK / unique / foreign keys (requires extending
  `DescribeTable` to return FK + constraint metadata — see §7) with add/drop actions
  (`add_primary_key`/`drop_primary_key`, `add_foreign_key`/`drop_foreign_key`).
- **Rename table** (S5) → small inline action in the structure toolbar.
- All destructive ops use a **shared confirm dialog that shows the server-previewed SQL**, not a
  client-built string. The existing `onDestructive`/`runRawSQL` (raw-SQL) path is **no longer
  used** for structure edits.

New TS types in `frontend/src/lib/types.ts`: `AlterTableRequest`, `AlterOp`, `ColumnDef`,
`IndexDef`, `ForeignKeyDef`, `AlterPreview`. New `api.ts` wrappers: `previewAlterTable`,
`alterTable`.

### 5.7 Post-change refresh

On success: re-run `api.describeTable` to refresh the Structure view; bubble a change signal so
the table list / open table tab re-reads (especially for `rename_table` and PK changes that affect
row editing). Reuse the existing `dataVersion`/reload mechanism where present.

---

## 6. UI / UX decisions

| Decision | Choice | Rationale |
|---|---|---|
| SQL construction | 100% server-side from a structured request | PRD hard constraint; removes injection + dialect guesswork from client. |
| Preview | Always available; shown inline in dialogs and mandatory in destructive confirms | Users (DBAs) want to see the exact DDL; preview is server-authoritative. |
| Destructive gate | Server-authoritative `confirmed` round-trip + UI confirm dialog | Client cannot bypass; matches DML destructive flow. |
| Type entry | Free-text type token + validation, not a fixed dropdown | DB types are open-ended (`DECIMAL(10,2)`, `ENUM(...)`, vendor types); validate shape, let engine be source of truth. |
| Batching | Single op per apply for M-tier; multi-op (C2) later | Simpler UX + clearer errors first; the model already supports batching. |
| FK constraint mgmt | In-scope (distinct from out-of-scope "FK navigation") | User explicitly asked for "add constraints"; flagged for owner sign-off. |
| Rename table | Confirm (not classified destructive) | Not data-lossy but can break references. |

---

## 7. Edge cases & dependencies

- **DescribeTable lacks FK/constraint metadata.** Implementing S2/S3 cleanly needs
  `TableStructure` extended with foreign keys (and named constraints). This is a **prerequisite**
  for the Constraints section; M1–M6 (columns + indexes) do **not** require it. Sequence: ship
  columns+indexes first, extend introspection for constraints next.
- **MySQL vs Postgres divergence** (S7): rename-column type requirement (MySQL `CHANGE`), no
  Postgres column reorder (S6), identity/serial vs `AUTO_INCREMENT`. Builder returns a surfaced
  error where an op isn't expressible for the active engine rather than emitting wrong SQL.
- **Implicit index drops:** dropping a unique/PK may drop a backing index; dropping a column may
  drop indexes that reference it. The preview shows exactly one statement; the engine cascades.
  Confirm copy should warn for PK/unique drops.
- **Auto-increment / single-PK assumptions:** adding `AUTO_INCREMENT` (MySQL) requires the column
  be a key; the engine error (surfaced verbatim) guides the user. We do not pre-validate this.
- **Default literal vs expression:** `DefaultIsExpr` controls quoting; `DEFAULT 'now()'` (string)
  vs `DEFAULT CURRENT_TIMESTAMP` (expr) must be distinguishable in the UI.
- **Open transaction / read-only connection:** `requireWrite()` blocks DDL on read-only
  connections, consistent with DML.
- **Renaming the open table (S5):** update open-tab + table-list state so the user isn't left
  pointed at a stale name.
- **Concurrent schema drift:** if the table changed underneath, the engine errors are surfaced
  verbatim; the post-change `describeTable` re-syncs the view.

---

## 8. Files to change

| File | Change |
|---|---|
| `internal/sqlbuilder/ddl.go` | **New** — `AlterTableRequest`/`AlterOp`/`ColumnDef`/`IndexDef`/`ForeignKeyDef`, `BuildAlterTable(d, req)`, type-token + ref-action validation. |
| `internal/sqlbuilder/safety.go` | Add `ClassifyAlter(req)` (request-level destructive verdict). |
| `internal/engine/engine.go` | Add `AlterTable(req) (dbtypes.RawResult, error)` to the `Engine` interface. |
| `internal/mysql/ddl.go` | **New** — MySQL `AlterTable` (build via `MySQLDialect` + execute). |
| `internal/postgres/ddl.go` | **New** *(S7)* — Postgres `AlterTable` (build via `PostgresDialect` + execute). |
| `internal/mysql/introspect.go` (+ `dbtypes`) | *(S2/S3)* Extend `TableStructure` with foreign keys / named constraints. |
| `app.go` / `app_ddl.go` | **New** — `PreviewAlterTable`, `AlterTable(req, confirmed)`; license + destructive gating. |
| `frontend/wailsjs/go/...` | Regenerated by Wails (models + bindings). |
| `frontend/src/lib/types.ts` | Add `AlterTableRequest`, `AlterOp`, `ColumnDef`, `IndexDef`, `ForeignKeyDef`, `AlterPreview`. |
| `frontend/src/lib/api.ts` | Add `previewAlterTable`, `alterTable` wrappers. |
| `frontend/src/pages/StructureView.tsx` | Wire real add/edit/drop for columns + indexes; new Constraints section; preview + confirm; remove the frontend-built `DROP COLUMN`. |
| `frontend/src/components/ColumnFormDialog.tsx`, `IndexFormDialog.tsx`, `ConstraintFormDialog.tsx` | **New** — structured editors. |

---

## 9. Acceptance criteria

1. Adding a column via the dialog generates **server-built** DDL (visible in preview), runs it,
   and the new column appears after `describeTable` refresh — **no SQL is built on the frontend**.
2. Editing a column's type/nullability/default/comment emits a `modify_column` (and
   `rename_column` if renamed) and applies correctly.
3. Renaming a column works on MySQL and Postgres (dialect-correct syntax).
4. Dropping a column shows a confirm dialog with the **server-previewed** SQL and only runs after
   confirmation; cancelling makes no change.
5. Adding a single- and multi-column index (with and without `UNIQUE`) works; dropping an index
   requires confirmation.
6. A non-Pro user attempting any structure edit hits `onPlanRequired` (no DDL runs); the gate is
   enforced **server-side** (`AlterTable` returns the plan-required error even if the UI is
   bypassed).
7. A destructive op cannot be executed without `confirmed=true`: calling `AlterTable(req,false)`
   for a `drop_*` returns a "confirmation required" error carrying the preview SQL.
8. MySQL/engine errors (e.g. bad type, duplicate index name) are surfaced verbatim with code via
   `AppError`.
9. `PreviewAlterTable` returns the same SQL that `AlterTable` executes (preview is authoritative).
10. *(S2/S3)* Adding/dropping a primary key, unique, and foreign-key constraint works and is
    reflected in a Constraints section after refresh.
11. *(S5)* Renaming the table updates the open tab and table list.
12. *(S7)* The same logical operation produces valid, distinct SQL on MySQL vs Postgres.

---

## 10. Test notes

- **Unit (Go) — strongly recommended here** (`sqlbuilder` is the security-critical surface):
  `BuildAlterTable` table-driven tests per dialect for each op kind — identifier quoting
  (names with backticks/quotes), default literal vs expression quoting, `NULL`/`NOT NULL`,
  auto-increment, position clauses (MySQL), unique/PK/FK clause shape, referential-action
  validation, and type-token rejection (`INT; DROP TABLE x`). `ClassifyAlter` tests for each
  destructive/non-destructive op kind, including the conservative `modify_column → NOT NULL` case.
- **Manual (PoC default):** against a scratch MySQL table — add column (all default modes),
  modify + rename, drop (confirm), add/drop unique + composite index, add/drop FK, rename table;
  verify preview SQL matches executed SQL and the view refreshes. Repeat the column/index subset
  against Postgres (S7). Confirm a Free license is blocked end-to-end.

---

## 12. Build sequence

Ordered implementation path (matches what landed in the repo):

1. **`internal/sqlbuilder/ddl.go`** — request types, `BuildAlterTable` per dialect, type-token validation.
2. **`internal/sqlbuilder/safety.go`** — `ClassifyAlter`.
3. **`internal/sqlbuilder/ddl_test.go`** — table-driven smoke tests (expand per §10).
4. **`internal/engine/engine.go`** — add `AlterTable` to the interface.
5. **`internal/mysql/ddl.go`**, **`internal/postgres/ddl.go`** — connector execution.
6. **`internal/apperror/apperror.go`** — `ConfirmationRequired`.
7. **`app_ddl.go`** — `PreviewAlterTable`, `AlterTable`; run `wails generate module`.
8. **`frontend/src/lib/types.ts`**, **`api.ts`**, **`errors.ts`** — TS types + wrappers.
9. **`ColumnFormDialog`**, **`IndexFormDialog`**, **`SchemaAlterModal`** — structured UI.
10. **`StructureView.tsx`** + **`Workspace.tsx`** — wire preview→apply; remove frontend-built DDL.
11. **Follow-up (Should):** extend `DescribeTable` for FK/PK constraint names → Constraints section UI; rename-table toolbar; expand `ddl_test.go` coverage.

---

## 13. Out of scope (restated)

`CREATE TABLE`/`DROP TABLE`, DB create/delete, views/triggers/procedures, schema diff/migration
generation, online/lock-aware migration hints, and **any frontend-built DDL**. Anything not in
§4.1/§4.2 is deferred per the PRD's "PRD is the contract" rule. Structure editing must not weaken
the destructive-op or license gates — both stay server-authoritative.
