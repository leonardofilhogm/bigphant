# Bigphant

**A fast, native macOS database client.**

Bigphant is a clean, opinionated desktop app for working with your databases — connect, browse, edit, query, and administer, all from one window. It's inspired by the experience of tools like TablePlus and Beekeeper Studio, with a focus on speed, safety, and a calm, modern interface.

Bigphant speaks **MySQL / MariaDB**, **PostgreSQL**, and **SQLite** — switch between them without changing how you work.

---

## Why Bigphant

- **Native and fast.** A real macOS app that launches instantly and stays responsive, even against large tables.
- **One window, everything you need.** Browse your data, edit rows, run raw SQL, manage structure, and administer the server — without juggling separate tools.
- **Safe by default.** Destructive operations are caught before they run, so a missing `WHERE` clause never becomes a bad day.
- **Your credentials stay yours.** Connection secrets are encrypted on disk and never leave your machine except to reach the database you chose.
- **Three engines, one experience.** MySQL/MariaDB, PostgreSQL, and SQLite all behave consistently.

---

## The Experience, Step by Step

### 1. Connect

When you open Bigphant for the first time, you're greeted with a connection screen.

- Choose your engine: **MySQL/MariaDB**, **PostgreSQL**, or **SQLite**.
- For networked databases, fill in the essentials — name, host, port, username, password, and an optional default database.
- For SQLite, just point Bigphant at a database **file** using the native file picker. No host, no port, no password.
- Hit **Test** to confirm everything works. If something's wrong, Bigphant shows you the database's own error message, word for word — no guessing.
- Need to reach a database behind a bastion host? Enable the built-in **SSH tunnel** and Bigphant routes the connection securely for you.

Save the connection and it's ready whenever you are. Your saved connections live in a simple list — double-click any one to jump straight into a workspace.

### 2. Browse

Once connected, the workspace opens with a sidebar of your databases and their tables.

- Pick a database to see every table at a glance, complete with row counts and storage details.
- Open a table and its rows appear in a fast, scrollable grid. Large tables stay snappy — Bigphant loads a sensible page at a time and lets you **page through** the rest.
- **Filter** with a friendly builder: pick a column, a comparator (`=`, `!=`, `>`, `<`, `LIKE`, `IS NULL`, and more), and a value. Stack multiple filters to narrow things down.
- **Show or hide columns** to focus on what matters.
- **Sort** by any column.
- JSON values are shown neatly collapsed, expandable into a pretty-printed view when you want the detail.

### 3. Edit

Editing data feels direct and forgiving.

- **Single-click a row** to slide open a side panel showing every column stacked vertically — perfect for reviewing and editing a record in full.
- **Double-click a cell** to edit it right in the grid; press Enter or Tab to save.
- **Add a new row** with a simple form.
- **Delete rows** with a clear confirmation that shows exactly what will happen.

Every change is handled carefully behind the scenes, always targeting the right record.

### 4. Stay Safe

Bigphant watches your back.

- Run something destructive — an `UPDATE` or `DELETE` with no `WHERE`, a `TRUNCATE`, a `DROP` — and Bigphant stops to show you the exact statement before anything happens.
- Prefer a stricter setup? Keep destructive operations **blocked entirely** until you opt in.
- Mark a connection **read-only** and Bigphant refuses anything that would change data.
- Choose **explicit-commit mode** and your changes run inside a transaction, with a Commit / Rollback bar that waits for your decision.

### 5. Query

When you want full control, open the **SQL Editor**.

- Write any query and run it with a keystroke.
- Work across **multiple tabs** in the same window.
- Results appear in the same fast grid you use for browsing.
- Your queries are kept in a session history so you can revisit what you ran.

### 6. Shape Your Schema

The **Structure** view lets you see and adjust a table's design.

- Review every column — its type, whether it's nullable, its default, and its keys.
- Add, edit, or drop columns, and manage indexes.
- Before any structural change runs, Bigphant previews the exact statement so there are no surprises.

### 7. Move Data In and Out

- **Export** any result set — from a table view or a query — to **CSV** or as ready-to-run **SQL insert statements**, via a standard macOS save dialog.
- **Import CSV** into a table, with a mapping step to line up your columns.

### 8. Ask the AI Assistant

Bigphant includes an optional **AI Assistant** that answers plain-language questions about your data.

- **Bring your own key.** Connect your own OpenRouter account and pick whichever model you like.
- **Read-only by design.** The assistant can only read — it runs through a dedicated read-only path and never modifies your data.
- **It knows your schema.** Bigphant builds an editable, per-database summary the assistant uses for context, and you can refine it whenever you want.
- **Full transparency.** You see each query the assistant runs as it works.

Enabling the assistant is always an explicit, per-connection choice — nothing happens until you opt in. Your API key stays encrypted on your machine.

### 9. Administer Your Server

For day-to-day database administration, the **Maintenance** menu brings server tasks into reach (availability varies by engine):

- **Users & Permissions** — create users or roles and manage their privileges through a clear permission matrix.
- **Create Database** — spin up a new database with the right charset, collation, encoding, or owner.
- **Server Activity** — see what's running, inspect lock waits, and stop a runaway query.
- **Database Maintenance** — run housekeeping like `OPTIMIZE`, `ANALYZE`, `VACUUM`, integrity checks, and reindexing.

Where a feature doesn't apply to your engine, Bigphant simply tells you rather than getting in your way.

### 10. Make It Yours

A focused **Settings** area lets you tune the experience: the destructive-operation safety behavior, default transaction mode, and a **light / dark / system** theme so Bigphant feels at home on your Mac.

---

## At a Glance

| | |
|---|---|
| **Platform** | macOS (Apple Silicon + Intel) |
| **Engines** | MySQL / MariaDB · PostgreSQL · SQLite |
| **Connectivity** | Direct or via SSH tunnel |
| **Editing** | Inline cells · vertical row panel · add / delete rows |
| **Querying** | Multi-tab SQL editor · filters · sorting · session history |
| **Schema** | Browse structure · add / edit columns · manage indexes |
| **Data transfer** | CSV & SQL export · CSV import |
| **AI** | Optional bring-your-own-key, read-only assistant |
| **Admin** | Users, databases, server activity, maintenance |
| **Safety** | Destructive-op guardrails · read-only connections · explicit-commit mode |
| **Privacy** | Encrypted credentials, stored only on your machine |

---

## Privacy & Security

Bigphant talks to the databases you configure and nothing else — there's no telemetry, no analytics, and no background phone-home. Your connection details, including passwords and SSH secrets, are encrypted on disk and never displayed back to you after saving. The only optional outbound connection is to your chosen AI provider, and only when you turn the AI Assistant on with your own key.

---

*Bigphant is under active development. Features and availability may evolve between releases.*
