import type {
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete"

// Strip surrounding identifier quotes (`, ", []) from a token.
function unquote(id: string): string {
  return id.replace(/^[`"[]/, "").replace(/[`"\]]$/, "")
}

// Table names referenced in FROM/JOIN clauses of `text`, resolved
// (case-insensitively) to the keys present in `schema`.
function fromTables(text: string, schema: Record<string, string[]>): string[] {
  const byLower = new Map(Object.keys(schema).map((k) => [k.toLowerCase(), k]))
  const re = /\b(?:from|join)\s+([`"[]?\w+[`"\]]?)/gi
  const found: string[] = []
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    const key = byLower.get(unquote(m[1]).toLowerCase())
    if (key && !found.includes(key)) found.push(key)
  }
  return found
}

// Completion source that offers columns of the tables referenced in the
// statement's FROM/JOIN clauses at plain (non-dotted) identifier positions —
// e.g. `SELECT <here> FROM accounts`. The dotted/aliased form (`a.<col>`) and
// the table-name positions are handled by lang-sql's own schemaCompletionSource.
export function fromColumnSource(
  schema: Record<string, string[]>
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\w*/)
    if (!word || (word.from === word.to && !context.explicit)) return null

    // Skip right after a dot (`table.col`) or right after FROM/JOIN (a
    // table-name position); both are covered by the schema source.
    const before = context.state.sliceDoc(0, word.from)
    if (/\.\s*$/.test(before)) return null
    if (/\b(?:from|join)\s+$/i.test(before)) return null

    const tables = fromTables(context.state.doc.toString(), schema)
    if (tables.length === 0) return null

    const options = tables.flatMap((t) =>
      schema[t].map((col) => ({ label: col, type: "property", detail: t }))
    )
    if (options.length === 0) return null

    return { from: word.from, options, validFor: /^\w*$/ }
  }
}
