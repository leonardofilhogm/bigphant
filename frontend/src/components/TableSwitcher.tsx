import { useEffect, useMemo, useRef, useState } from "react"
import { Eye, Search, Table2 } from "lucide-react"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Entity, TableSummary } from "@/lib/types"

type Item =
  | { kind: "table"; name: string; table: TableSummary }
  | { kind: "entity"; name: string; entity: Entity }

interface TableSwitcherProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tables: TableSummary[]
  entities: Entity[]
  onOpenTable: (table: string) => void
  onOpenEntity: (entity: Entity) => void
}

// A VS Code-style quick-open (⌘P) for jumping to a table or other entity
// without reaching for the sidebar. Substring filter, arrow-key navigation,
// Enter to open, Esc to dismiss.
export function TableSwitcher({
  open,
  onOpenChange,
  tables,
  entities,
  onOpenTable,
  onOpenEntity,
}: TableSwitcherProps) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...tables.map((t) => ({ kind: "table" as const, name: t.name, table: t })),
      ...entities.map((e) => ({ kind: "entity" as const, name: e.name, entity: e })),
    ]
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((it) => it.name.toLowerCase().includes(q))
  }, [tables, entities, query])

  // Reset transient state each time the dialog opens; clamp selection as the
  // filtered list shrinks while typing.
  useEffect(() => {
    if (open) {
      setQuery("")
      setSelected(0)
    }
  }, [open])

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(items.length - 1, 0)))
  }, [items.length])

  // Keep the highlighted row in view as the user arrows through the list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [selected])

  function choose(it: Item) {
    if (it.kind === "table") onOpenTable(it.name)
    else onOpenEntity(it.entity)
    onOpenChange(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelected((s) => (items.length ? (s + 1) % items.length : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelected((s) => (items.length ? (s - 1 + items.length) % items.length : 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const it = items[selected]
      if (it) choose(it)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[20%] flex max-h-[60vh] translate-y-0 flex-col gap-0 p-0 sm:max-w-xl"
        onKeyDown={onKeyDown}
      >
        <div className="p-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Go to table…"
              className="pl-9"
            />
          </div>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-auto border-t py-1">
          {items.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-xs">
              No tables match “{query}”.
            </p>
          ) : (
            items.map((it, i) => {
              const Icon = it.kind === "table" ? Table2 : Eye
              const sub =
                it.kind === "table"
                  ? `${it.table.row_count.toLocaleString()} rows`
                  : String(it.entity.kind).replace(/_/g, " ")
              return (
                <button
                  key={`${it.kind}:${it.name}`}
                  data-index={i}
                  onClick={() => choose(it)}
                  onMouseMove={() => setSelected(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
                    i === selected ? "bg-accent" : "hover:bg-accent/50"
                  )}
                >
                  <Icon className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate text-sm">{it.name}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {sub}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
