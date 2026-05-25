import { useEffect, useRef, useState } from "react"
import { ChevronDown, Database, Plus, Search, Table2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import type { TableSummary } from "@/lib/types"

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface SidebarProps {
  databases: string[]
  database: string
  onDatabaseChange: (db: string) => void
  onCreateDatabase: (name: string) => Promise<void>
  tables: TableSummary[]
  loadingTables: boolean
  activeTable: string | null
  onOpenTable: (table: string, sub?: "data" | "structure") => void
  onDestructive: (sql: string) => void
}

export function Sidebar({
  databases,
  database,
  onDatabaseChange,
  onCreateDatabase,
  tables,
  loadingTables,
  activeTable,
  onOpenTable,
  onDestructive,
}: SidebarProps) {
  const [query, setQuery] = useState("")
  const filtered = (tables ?? []).filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase())
  )

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")
  const [newDbName, setNewDbName] = useState("")
  const [creating, setCreating] = useState(false)
  const createInputRef = useRef<HTMLInputElement>(null)

  const filteredDbs = (databases ?? []).filter((db) =>
    db.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  function selectDb(db: string) {
    onDatabaseChange(db)
    setPickerOpen(false)
    setPickerSearch("")
  }

  async function handleCreate() {
    const name = newDbName.trim()
    if (!name) return
    setCreating(true)
    try {
      await onCreateDatabase(name)
      setNewDbName("")
      selectDb(name)
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    if (!pickerOpen) {
      setPickerSearch("")
      setNewDbName("")
    }
  }, [pickerOpen])

  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full w-60 shrink-0 flex-col border-r">
      <div className="p-2">
        <button
          onClick={() => setPickerOpen(true)}
          className="flex h-8 w-full items-center gap-1.5 rounded-md border bg-transparent px-2.5 text-xs transition-colors hover:bg-accent"
        >
          <Database className="text-muted-foreground size-3.5 shrink-0" />
          <span className="flex-1 truncate text-left">{database || "Select database"}</span>
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
        </button>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="gap-0 p-0 sm:max-w-sm">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm">Switch database</DialogTitle>
          </DialogHeader>

          <div className="border-b px-3 py-2">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                autoFocus
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search databases…"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>

          <ScrollArea className="max-h-64">
            <ul className="p-1">
              {filteredDbs.length === 0 && (
                <li className="text-muted-foreground px-3 py-2 text-xs">No results.</li>
              )}
              {filteredDbs.map((db) => (
                <li key={db}>
                  <button
                    onClick={() => selectDb(db)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-xs transition-colors",
                      db === database
                        ? "bg-accent text-accent-foreground font-medium"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <Database className="text-muted-foreground size-3.5 shrink-0" />
                    {db}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>

          <div className="border-t px-3 py-2">
            <p className="text-muted-foreground mb-1.5 text-[10px] font-medium uppercase tracking-wide">
              New database
            </p>
            <div className="flex gap-2">
              <Input
                ref={createInputRef}
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="database_name"
                className="h-7 flex-1 font-mono text-xs"
              />
              <Button
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={!newDbName.trim() || creating}
                onClick={handleCreate}
              >
                <Plus className="size-3" />
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tables"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="text-muted-foreground px-3 pb-1 text-[10px] font-medium uppercase tracking-wide">
        Tables ({filtered.length})
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loadingTables ? (
          <div className="text-muted-foreground px-3 py-2 text-xs">Loading…</div>
        ) : (
          <ul className="px-1 pb-2">
            {filtered.map((t) => (
              <ContextMenu key={t.name}>
                <ContextMenuTrigger asChild>
                  <li>
                    <button
                      onClick={() => onOpenTable(t.name)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors",
                        activeTable === t.name
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent/50"
                      )}
                    >
                      <Table2 className="text-muted-foreground size-3.5 shrink-0" />
                      <span className="flex-1 truncate">{t.name}</span>
                      <span className="text-muted-foreground tabular-nums text-[10px]">
                        {formatCount(t.row_count)}
                      </span>
                    </button>
                  </li>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                  <ContextMenuItem onClick={() => onOpenTable(t.name)}>Open</ContextMenuItem>
                  <ContextMenuItem onClick={() => onOpenTable(t.name, "structure")}>Open Structure</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() => onDestructive(`TRUNCATE TABLE \`${t.name}\``)}
                  >
                    Truncate
                  </ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() => onDestructive(`DROP TABLE \`${t.name}\``)}
                  >
                    Drop
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
