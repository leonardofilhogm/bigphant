// Helpers to serialize a single grid row for the "copy row" context menu.
// These produce clipboard-friendly text only — they do NOT go through the
// server-side sqlbuilder, so the SQL output is a best-effort convenience for
// pasting into an editor, not a safe parameterized statement.

import type { Column } from "@/lib/types"

// rowToJSON maps each column to its value as a pretty-printed JSON object.
export function rowToJSON(columns: Column[], row: unknown[]): string {
  const obj: Record<string, unknown> = {}
  columns.forEach((c, i) => {
    obj[c.name] = row[i] === undefined ? null : row[i]
  })
  return JSON.stringify(obj, null, 2)
}

// rowToInsert builds an `INSERT INTO ... VALUES (...)` statement. Identifiers
// are backtick-quoted (MySQL style); string values single-quoted with quotes
// doubled. JSON/array cells are stringified and quoted.
export function rowToInsert(table: string, columns: Column[], row: unknown[]): string {
  const cols = columns.map((c) => "`" + c.name + "`").join(", ")
  const vals = columns.map((_, i) => sqlValue(row[i])).join(", ")
  return `INSERT INTO \`${table}\` (${cols}) VALUES (${vals});`
}

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL"
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE"
  if (typeof v === "object") return quote(JSON.stringify(v))
  return quote(String(v))
}

function quote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'"
}
