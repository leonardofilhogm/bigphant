import { useState } from "react"
import { ArrowDown, ArrowUp, Info, Loader2, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatBytes, formatCount } from "@/lib/format"
import type { TableSummary } from "@/lib/types"

type SortKey =
  | "name"
  | "row_count"
  | "size_bytes"
  | "data_size_bytes"
  | "index_size_bytes"
  | "charset"
  | "engine"

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "Name" },
  { key: "row_count", label: "Rows", align: "right" },
  { key: "size_bytes", label: "Size", align: "right" },
  { key: "data_size_bytes", label: "Data", align: "right" },
  { key: "index_size_bytes", label: "Index", align: "right" },
  { key: "charset", label: "Charset" },
  { key: "engine", label: "Engine" },
]

interface TableOverviewProps {
  database: string
  tables: TableSummary[]
  loading: boolean
  onOpenTable: (name: string, sub?: "data" | "structure") => void
  onDestructive: (sql: string) => void
  identQuote: "`" | '"'
}

function quoteIdent(name: string, identQuote: "`" | '"') {
  if (identQuote === "`") return `\`${name.replaceAll("`", "``")}\``
  return `"${name.replaceAll(`"`, `""`)}"`
}

function compareRows(a: TableSummary, b: TableSummary, key: SortKey, dir: "asc" | "desc"): number {
  const mul = dir === "asc" ? 1 : -1
  if (key === "name" || key === "charset" || key === "engine") {
    const av = (a[key] ?? "").toLowerCase()
    const bv = (b[key] ?? "").toLowerCase()
    return av.localeCompare(bv) * mul
  }
  const av = a[key] ?? 0
  const bv = b[key] ?? 0
  if (av < bv) return -1 * mul
  if (av > bv) return 1 * mul
  return 0
}

function defaultDirFor(key: SortKey): "asc" | "desc" {
  return key === "name" || key === "charset" || key === "engine" ? "asc" : "desc"
}

export function TableOverview({
  database,
  tables,
  loading,
  onOpenTable,
  onDestructive,
  identQuote,
}: TableOverviewProps) {
  const [sortBy, setSortBy] = useState<SortKey>("size_bytes")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [filter, setFilter] = useState("")

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(key)
      setSortDir(defaultDirFor(key))
    }
  }

  const q = filter.trim().toLowerCase()
  const visible = tables
    .filter((t) => !q || t.name.toLowerCase().includes(q))
    .sort((a, b) => compareRows(a, b, sortBy, sortDir))

  if (loading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading tables…
      </div>
    )
  }

  if (tables.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        No tables in {database}
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="relative max-w-sm">
            <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tables"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background sticky top-0 z-10 border-b shadow-sm">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "text-muted-foreground cursor-pointer px-4 py-2 text-left text-xs font-medium tracking-wide uppercase select-none hover:text-foreground",
                      col.align === "right" && "text-right"
                    )}
                    onClick={() => handleSort(col.key)}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        col.align === "right" && "justify-end"
                      )}
                    >
                      {col.label}
                      {col.key === "row_count" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground/70 hover:text-muted-foreground inline-flex"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="About row counts"
                            >
                              <Info className="size-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            Row counts are approximate for InnoDB and autovacuumed
                            Postgres tables.
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {sortBy === col.key &&
                        (sortDir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="text-muted-foreground px-4 py-8 text-center text-sm"
                  >
                    No tables match &ldquo;{filter}&rdquo;
                  </td>
                </tr>
              ) : (
                visible.map((t) => (
                  <ContextMenu key={t.name}>
                    <ContextMenuTrigger asChild>
                      <tr
                        className="hover:bg-muted/50 cursor-pointer border-b transition-colors"
                        onClick={() => onOpenTable(t.name)}
                      >
                        <td className="px-4 py-2 font-medium">{t.name}</td>
                        <td className="text-muted-foreground px-4 py-2 text-right tabular-nums">
                          {formatCount(t.row_count)}
                        </td>
                        <td className="text-muted-foreground px-4 py-2 text-right tabular-nums">
                          {formatBytes(t.size_bytes)}
                        </td>
                        <td className="text-muted-foreground px-4 py-2 text-right tabular-nums">
                          {formatBytes(t.data_size_bytes)}
                        </td>
                        <td className="text-muted-foreground px-4 py-2 text-right tabular-nums">
                          {formatBytes(t.index_size_bytes)}
                        </td>
                        <td className="text-muted-foreground px-4 py-2">
                          {t.charset || "—"}
                        </td>
                        <td className="text-muted-foreground px-4 py-2">
                          {t.engine || "—"}
                        </td>
                      </tr>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-44">
                      <ContextMenuItem onClick={() => onOpenTable(t.name)}>
                        Open
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => onOpenTable(t.name, "structure")}>
                        Open Structure
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() =>
                          onDestructive(`TRUNCATE TABLE ${quoteIdent(t.name, identQuote)}`)
                        }
                      >
                        Truncate
                      </ContextMenuItem>
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() =>
                          onDestructive(`DROP TABLE ${quoteIdent(t.name, identQuote)}`)
                        }
                      >
                        Drop
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  )
}
