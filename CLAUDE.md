# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Bigphant is a native macOS MySQL database client (Wails v2 = Go backend + React frontend), inspired by TablePlus/Beekeeper Studio. This is a **proof of concept**: single-engine (MySQL), single-OS (macOS), no SSH/TLS. The full contract is `docs/prd.md` — **read it before implementing any feature.** It defines acceptance criteria (Must/Should/Could Have), Wails method signatures to generate verbatim (§8), the data model (§7), and the ordered build sequence (§10).

## Current state vs. target (important)

The repo is currently the **stock Wails React-JS template** — only `app.go` (with a placeholder `Greet`), `main.go`, and the default `frontend/src/*.jsx` exist. Almost nothing from the PRD is built yet. Two gaps to close as work begins:

- **The PRD targets React + TypeScript, but the scaffold is JavaScript** (`.jsx`, `vite.config.js`, no `tsconfig`). New frontend code should be TypeScript per the PRD; migrate scaffold files as you touch them.
- **Tailwind + shadcn/ui are not installed yet** (`frontend/package.json` has only react/react-dom). PRD build step 2 covers installing them plus base shadcn components.

No `internal/` packages exist yet — they are created in PRD build order (§6, §10).

## Commands

```bash
wails dev          # Live dev with hot reload; also serves Go methods at http://localhost:34115 for devtools
wails build        # Production .app build
wails build -platform darwin/universal   # Universal (Intel + Apple Silicon) build for distribution
wails doctor       # Diagnose environment / missing deps
```

Frontend-only (run inside `frontend/`): `npm install`, `npm run dev`, `npm run build`. Go: standard `go build ./...`, `go test ./...` (tests optional for PoC; suggested for `sqlbuilder` and `crypto`).

After adding or changing exported methods on the `App` struct, Wails regenerates TypeScript bindings into `frontend/wailsjs/go/...` on the next `wails dev`/`wails build`. The frontend calls Go only through these generated bindings — never via HTTP.

## Architecture & non-negotiable constraints

These rules span many files; violating them breaks the PoC's contract:

- **All MySQL access goes through `internal/mysql`.** The frontend constructs SQL only in the raw SQL-editor textarea. Every other query (CRUD, filters, ALTER) is built server-side by `internal/sqlbuilder` using `?` placeholders — **never `fmt.Sprintf` user values into SQL.**
- **Destructive-op detection is server-side** (`internal/sqlbuilder/safety.go`) and gates *both* the mutation paths and `ExecuteRaw`. The frontend cannot bypass it by crafting SQL. Classifier rules and the block-vs-confirm flow are in PRD §9. When in doubt, classify as destructive (false positive over false negative).
- **Credentials never reach the frontend in cleartext.** The frontend receives connection metadata (name/host/port/username) but never the password after save. To use a saved connection, the Go backend reads and decrypts the file itself. Connection files: AES-256-GCM (nonce-prepended), one `.enc` file per connection at `~/Library/Application Support/Bigphant/connections/<uuid>.enc`. The PoC uses a static app-bound key — **document this as a known weakness**, slated for macOS Keychain in v0.2.
- **No application database and no persisted state in MySQL.** All app state is two files under `~/Library/Application Support/Bigphant/`: the encrypted connection files and a plaintext `settings.json` (PRD §7.2).
- **One window = one connection** conceptually, each owning its own `sql.DB` pool keyed by connection ID. (True multi-window is a stretch goal; an in-app connection switcher is acceptable for the PoC — PRD §10 note.)
- **No external network calls** other than the user-configured MySQL connections. No telemetry, no update checks, no backend HTTP server.
- **Surface MySQL errors verbatim** with their original error codes via the `AppError{Code, Message, SQL}` shape (PRD §8). Do not swallow them.
- **Auto-`LIMIT 300`** for the table-browse view; SQL-editor queries are NOT auto-limited.

## Out of scope — do not build (PRD §4)

Even if they look like trivial extensions: any non-MySQL engine, any non-macOS OS, SSH tunneling, SSL/TLS options, master password, FK navigation, command palette, schema diff, mysqldump backup, views/triggers/procedures management, DB create/delete from UI, visual query builder, auto-update, code signing, telemetry, **agentic/LLM features**, multi-user/cloud sync, i18n, persistent query history. No ORMs (GORM/ent) — use `database/sql` + `go-sql-driver/mysql` directly.

The PRD is the contract: anything not in Must/Should/Could Have is out of scope, full stop.
