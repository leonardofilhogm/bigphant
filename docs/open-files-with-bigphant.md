# Open database & SQL files with Bigphant (macOS file associations)

> Status: planned, not yet implemented. macOS only.

## Context

Today, double-clicking `.sql` / `.sqlite` / `.dump` files in Finder opens them in
Beekeeper Studio because Bigphant declares no document types. We want Bigphant to
register as a handler for these files and react when one is opened:

- **SQLite DB files** (`.sqlite`, `.sqlite3`, `.db`, `.db3`) → create (or reuse) a
  **saved** SQLite connection pointing at that file, then open it.
- **SQL script files** (`.sql`, `.dump`) → load the file's contents into a **new SQL
  editor tab** against the currently active connection. If no connection is open,
  show guidance to open one first.

Wails v2.12.0 already exposes the plumbing: the macOS `Info.plist`/`Info.dev.plist`
templates render `CFBundleDocumentTypes` from `info.fileAssociations` in `wails.json`
(`build/darwin/Info*.plist` already contain the `{{range .Info.FileAssociations}}`
block), and `mac.Options` has an `OnFileOpen func(filePath string)` callback.

## Backend

### 1. `wails.json` — declare file associations
Add an `info.fileAssociations` array with one entry per extension. Use
`role: "Editor"`. Example entries: `sqlite`, `sqlite3`, `db`, `db3` (name "SQLite
Database"), and `sql`, `dump` (name "SQL Script"). No custom `iconName` (omit →
generic doc icon; keeps scope small, no icon assets needed).

> Note: `.db` is a generic extension other apps also claim; macOS resolves the
> conflict via the user's "Open With" default. Include it as requested but be aware
> it's the broadest of the set.

### 2. `main.go` — register the callback
In the `Mac: &mac.Options{…}` block add `OnFileOpen: app.onFileOpen`.

### 3. New file `app_fileopen.go` — handling + buffering
The OS can fire `OnFileOpen` on a cold launch **before** the React app has mounted
its listeners. Buffer until the frontend signals readiness:

- State on `App` (guarded by a `sync.Mutex`): `pendingOpens []FileOpenRequest`,
  `frontendReady bool`. (Add the mutex + slice; reuse existing `a.ctx`.)
- `FileOpenRequest` struct (JSON-tagged, exported so bindings generate):
  `Kind string` (`"connection"` | `"sql"`), `Connection *connections.ConnectionMeta`,
  `Name string`, `Content string`.
- `onFileOpen(path string)`: classify by lowercased extension via a helper
  `classifyOpenFile(path)`. Build the `FileOpenRequest`:
  - **SQLite ext** → look for an existing connection whose `FilePath == path` by
    scanning `a.store.List()` (`ConnectionMeta.FilePath` is present); if found reuse
    its meta, else `a.store.Create(connections.ConnectionInput{Driver: "sqlite",
    FilePath: path, Name: <base filename w/o ext>})`. Set `Kind: "connection"`,
    `Connection: &meta`.
  - **SQL ext** → read the file (cap size, e.g. ~8 MB, to avoid loading a giant
    dump into the webview; on oversize, emit an error event/toast instead). Set
    `Kind: "sql"`, `Name: <base filename>`, `Content: <bytes>`.
  - Unknown ext → ignore.
  - Then: lock; if `!frontendReady` append to `pendingOpens`; else
    `runtime.EventsEmit(a.ctx, "file:open", req)`.
- Bound method `DrainPendingOpens() ([]FileOpenRequest, error)`: lock, set
  `frontendReady = true`, return and clear `pendingOpens`. Frontend calls this once
  on mount.

Reuse: `connections.Store.Create`/`List` (`internal/connections/store.go`),
`ConnectionMeta`/`ConnectionInput` (`internal/connections/model.go`), `runtime.EventsEmit`.
SQLite engine open path is unchanged — the saved connection flows through the
existing `OpenConnection` → `openEngine` dispatch on `Driver == "sqlite"`.

## Frontend

After backend changes, run `wails dev`/`build` once to regenerate bindings in
`frontend/wailsjs/go/...`; then add `drainPendingOpens` to `frontend/src/lib/api.ts`
alongside the existing `openConnection` wrappers. Add a `FileOpenRequest` type to
`frontend/src/lib/types.ts`.

### 4. `App.tsx` — own the connection-open path + dispatch
- On mount (after activation/settings ready), call `api.drainPendingOpens()` and
  handle each request; also subscribe to the live `EventsOn("file:open", …)` event.
  Route both through one `handleFileOpen(req)`:
  - `kind === "connection"`: mirror `ConnectionList.open()` —
    `await api.openConnection(req.connection.id)` then `activateConnection(req.connection)`;
    on error use `isPlanRequired`/`parseAppError` → `onPlanRequired(message)` (reuse
    `@/lib/errors`).
  - `kind === "sql"`: if no `activeId`, `toast("Open a connection to load this SQL
    file")`; else re-emit a frontend event the active Workspace listens to (e.g.
    `EventsEmit("file:open-sql", { name, content })` via `runtime`).

### 5. `Workspace.tsx` — seed a SQL editor tab from file contents
- Extend the `sql` tab variant to carry an optional seed:
  `{ id: string; kind: "sql"; seed?: { name: string; sql: string } }`.
- Add a `file:open-sql` handler to the existing `useMenuEvents({...}, isActive)` map
  (line ~480, already `isActive`-guarded so only the visible connection responds).
  It pushes a new sql tab carrying the seed (use a unique id like `sql:file:<seq>`
  so multiple files can open distinct tabs rather than collapsing onto the single
  `"sql"` tab in `openSql()`).
- Pass the seed down to `SqlEditor` at the render site (line ~788).

### 6. `SqlEditor.tsx` — accept seeded initial content
- Add optional props `initialSql?: string` and `initialName?: string` to
  `SqlEditorProps`. Use them to initialize the first `EditorTab` instead of the
  hardcoded `"SELECT * FROM employees…"` sample (line 44–54) when provided.

## Out-of-scope / notes
- **macOS only.** Windows would additionally need `os.Args` parsing at startup +
  `OnSecondInstanceLaunch`/single-instance handling, because Windows passes the
  opened file as a command-line argument rather than via `OnFileOpen`. Not in scope
  — consistent with the PoC's macOS-only constraint.
- No custom document icons (generic icon is fine for the PoC).
- Cold-launching a `.sql` file with no connection open just shows the toast — a
  `.sql` script needs a target DB to be meaningful; this matches the confirmed UX.
- Honors existing constraints: SQLite stays a file-path connection (no host/port),
  license gating still runs inside `OpenConnection`, and no SQL is `fmt.Sprintf`'d.

## Verification
1. `wails build` (or `wails dev` once) to regenerate bindings and produce the `.app`.
2. Confirm `build/bin/bigphant.app/Contents/Info.plist` now contains
   `CFBundleDocumentTypes` with the six extensions.
3. In Finder, right-click a `.sqlite` file → **Open With ▸ Bigphant** (may need to
   set it once via Get Info ▸ Open with ▸ Change All). Expect: a saved SQLite
   connection appears and opens to its workspace. Re-opening the same file reuses the
   connection (no duplicate).
4. With a connection open, double-click a `.sql` file → a new SQL editor tab opens
   pre-filled with the file's contents, runnable with ⌘↵.
5. Cold launch: quit Bigphant, double-click a `.sqlite` file → app launches and opens
   it (verifies the pending-buffer + `DrainPendingOpens` path).
6. `.sql` opened with no active connection → toast guidance, no crash.
