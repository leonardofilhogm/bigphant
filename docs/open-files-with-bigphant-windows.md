# Open database & SQL files with Bigphant — Windows

> Status: planned, not yet implemented. **Windows variant** of
> `open-files-with-bigphant.md` (which covers macOS).
>
> ⚠️ Windows support is **outside the PoC's documented macOS-only scope**
> (CLAUDE.md / PRD §4). This plan exists so the work is ready if/when Windows
> becomes a target. It assumes the macOS plan's shared pieces are already built.

## Context

Same goal as macOS: stop `.sql` / `.sqlite` / `.dump` files from opening in another
client and have Bigphant handle them —

- **SQLite DB files** (`.sqlite`, `.sqlite3`, `.db`, `.db3`) → create (or reuse) a
  **saved** SQLite connection pointing at that file, then open it.
- **SQL script files** (`.sql`, `.dump`) → load contents into a **new SQL editor
  tab** against the active connection; if none is open, toast guidance.

### Why Windows is different from macOS
On macOS the OS calls a dedicated callback (`mac.Options.OnFileOpen`). **Windows has
no equivalent.** Instead:

1. **Registration** happens in the **NSIS installer** (registry `Software\Classes`
   keys), not in a plist. Wails generates these from the *same* `info.fileAssociations`
   in `wails.json`, but they only take effect for an **installed** build, and the
   registered `open` command is `"<exe>" "%1"`.
2. **Delivery** of the opened path is via the **command line**:
   - **Cold launch** → the path is in `os.Args[1:]`.
   - **Already running** → Windows launches a *second* process with the path in its
     args. To route it to the existing window (instead of opening a duplicate), the
     app must use Wails' **single-instance lock**; the second process hands its args
     to the first via `OnSecondInstanceLaunch(SecondInstanceData{Args})` and exits.

The **frontend half is identical** to macOS (events, SQL-editor seeding, SQLite
connection creation) and is **reused unchanged**.

## Shared backend (reused from the macOS plan — must exist first)

This plan depends on these pieces from `open-files-with-bigphant.md` already being in
place; they are platform-agnostic:

- `app_fileopen.go` with: the `FileOpenRequest` struct, the `pendingOpens` +
  `frontendReady` mutex-guarded buffer, `classifyOpenFile(path)`, the core
  `onFileOpen(path string)` dispatcher (creates/reuses the SQLite connection or reads
  SQL contents; buffers until ready, else emits `runtime.EventsEmit("file:open", …)`),
  and the bound `DrainPendingOpens()` method.
- The `info.fileAssociations` block in `wails.json` (shared declaration).
- Frontend: `App.tsx` dispatch, `Workspace.tsx` seeded SQL tab, `SqlEditor.tsx`
  `initialSql`/`initialName` props.

The macOS buffering already handles the cold-launch race (`frontendReady == false`
until the React app calls `DrainPendingOpens`), so the Windows arg path needs **no
new buffering** — it just feeds paths into the same `onFileOpen`.

## Windows-specific work

### 1. `wails.json` — provide a Windows icon for associations (optional but recommended)
Reuse the same `info.fileAssociations` entries. On Windows the per-type `iconName`
maps to the registry `DefaultIcon`; Wails expects a matching `.ico` under
`build/windows/`. If `iconName` is omitted, associated files fall back to the app
executable's icon — acceptable for a first pass (keeps scope small).

### 2. Build with the NSIS installer
File associations on Windows are registered by the installer, not a loose `.exe`:

```
wails build -platform windows/amd64 -nsis
```

Wails regenerates `build/windows/installer/wails_tools.nsh` at build time, filling the
currently-empty `wails.associateFiles` macro with `APP_ASSOCIATE` calls (one per
extension). The user must run the produced `*-installer.exe` for associations to take
effect. Document that running the bare `bigphant.exe` does **not** register handlers.

### 3. `main.go` — single-instance lock + cold-launch arg parsing
Add to the `options.App` passed to `wails.Run`:

```go
SingleInstanceLock: &options.SingleInstanceLock{
    UniqueId:               "com.wails.bigphant",        // stable per-app id
    OnSecondInstanceLaunch: app.onSecondInstance,         // see app_fileopen_windows.go
},
```

This makes Bigphant single-instance: a second double-click won't spawn a new window
(consistent with the PoC's "in-app connection switcher; true multi-window is a stretch
goal" note). When a second launch occurs, Wails delivers its args to the running
instance's `OnSecondInstanceLaunch` and the new process exits.

Cold launch: before/while building the app, read `os.Args[1:]` and funnel any
file-path args into the shared dispatcher. Because `a.ctx` / `frontendReady` aren't
set yet, the existing buffer captures them and `DrainPendingOpens()` releases them
once the frontend mounts.

### 4. New file `app_fileopen_windows.go` (build-tagged `//go:build windows`)
Keep Windows-only glue out of the shared file:

- `handleOpenArgs(args []string)`: for each arg, skip flags, resolve to an absolute
  path, check it exists and matches a known extension (reuse `classifyOpenFile`), and
  call `a.onFileOpen(path)` for matches.
- `onSecondInstance(data options.SecondInstanceData)`: by the time a second instance
  launches, the window exists and `frontendReady` is true, so `onFileOpen` emits the
  live `file:open` event directly. Also call `runtime.WindowShow(a.ctx)` /
  `runtime.Show(a.ctx)` to bring the existing window to the foreground.
- Cold-launch hook: call `handleOpenArgs(os.Args[1:])` from `startup`/`OnStartup`
  (after the store is initialized) — or from `main.go` right after `NewApp()` — so the
  buffer captures it pre-mount.

> Mac vs. Windows wiring summary: macOS uses `mac.Options.OnFileOpen → onFileOpen`.
> Windows uses `os.Args` (cold) + `SingleInstanceLock.OnSecondInstanceLaunch` (warm),
> both → `handleOpenArgs → onFileOpen`. The `onFileOpen` core and everything below it
> is shared.

## Caveats / notes
- **Single-instance is a behavior change.** Enabling `SingleInstanceLock` makes the
  whole app single-instance on every OS it's built for. Acceptable given the PoC's
  single-window model, but call it out — it would constrain a future multi-window
  feature.
- `.db` is a broad extension other tools also claim; the installer backs up any prior
  association (`APP_ASSOCIATE` writes a `_backup`) and `wails.unassociateFiles`
  restores it on uninstall.
- Path quoting: Wails registers the command as `"<exe>" "%1"`, so spaces in paths
  arrive as a single arg — still validate/normalize in `handleOpenArgs`.
- The ~8 MB SQL-file size cap and "no connection → toast" behavior from the macOS plan
  apply unchanged.

## Verification
1. `wails build -platform windows/amd64 -nsis` on a Windows host (or CI runner).
2. Run the generated `bigphant-amd64-installer.exe`; confirm install completes.
3. In `regedit`, confirm `HKCU\Software\Classes\.sqlite` (and the other five) point at
   a Bigphant file class whose `shell\open\command` is `"…\bigphant.exe" "%1"`.
4. With Bigphant **closed**, double-click a `.sqlite` file → app launches and opens a
   saved SQLite connection to it (cold-launch `os.Args` path + buffer).
5. With Bigphant **open** and a connection active, double-click a `.sql` file → the
   existing window comes forward and a new SQL editor tab opens pre-filled
   (single-instance `OnSecondInstanceLaunch` path). No duplicate window appears.
6. Re-open the same `.sqlite` file → connection is reused, not duplicated.
7. Uninstall → confirm associations are removed / prior `.db` handler restored.
