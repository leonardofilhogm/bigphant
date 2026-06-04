import { useEffect, useMemo, useRef, useState } from "react"
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FunctionSquare,
  Hash,
  Layers,
  ListTree,
  PlaySquare,
  Plus,
  Search,
  Table2,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

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
import { api } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { entityTabId, EntityDefinitionView } from "@/components/EntityDefinition"
import type { Entity, TableSummary } from "@/lib/types"
import type { LucideIcon } from "lucide-react"

const ENTITY_SECTIONS: { kind: string; label: string; icon: LucideIcon }[] = [
  { kind: "view", label: "Views", icon: Eye },
  { kind: "materialized_view", label: "Materialized Views", icon: Layers },
  { kind: "function", label: "Functions", icon: FunctionSquare },
  { kind: "procedure", label: "Procedures", icon: PlaySquare },
  { kind: "trigger", label: "Triggers", icon: Zap },
  { kind: "sequence", label: "Sequences", icon: Hash },
  { kind: "event", label: "Events", icon: Calendar },
  { kind: "enum", label: "Enums", icon: ListTree },
]

interface SidebarProps {
  driver?: string
  namespace: string
  databases: string[]
  database: string
  onDatabaseChange: (db: string) => void
  onCreateDatabase: (name: string) => Promise<void>
  schemas?: string[]
  schema?: string
  onSchemaChange?: (schema: string) => void
  tables: TableSummary[]
  entities: Entity[]
  loadingTables: boolean
  loadingEntities: boolean
  activeTable: string | null
  activeEntityId: string | null
  onOpenTable: (table: string, sub?: "data" | "structure") => void
  onOpenEntity: (entity: Entity, sub?: "data" | "definition") => void
  onDestructive: (sql: string) => void
}

export function Sidebar({
  driver,
  namespace,
  databases,
  database,
  onDatabaseChange,
  onCreateDatabase,
  schemas,
  schema,
  onSchemaChange,
  tables,
  entities,
  loadingTables,
  loadingEntities,
  activeTable,
  activeEntityId,
  onOpenTable,
  onOpenEntity,
  onDestructive,
}: SidebarProps) {
  const [query, setQuery] = useState("")
  const q = query.toLowerCase()
  const filtered = (tables ?? []).filter((t) => t.name.toLowerCase().includes(q))
  const filteredEntities = (entities ?? []).filter((e) => e.name.toLowerCase().includes(q))

  const entitiesByKind = useMemo(() => {
    const map = new Map<string, Entity[]>()
    for (const e of filteredEntities) {
      const list = map.get(e.kind) ?? []
      list.push(e)
      map.set(e.kind, list)
    }
    return map
  }, [filteredEntities])

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    tables: false,
    view: true,
    materialized_view: true,
    function: true,
    procedure: true,
    trigger: true,
    sequence: true,
    event: true,
    enum: true,
  })

  function toggleSection(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function copyCreate(entity: Entity) {
    try {
      const text = await api.entityDefinition(namespace, entity.schema, entity.kind, entity.name)
      await navigator.clipboard.writeText(text)
      toast.success("Copied to clipboard")
    } catch (e) {
      toast.error("Failed to copy", { description: String(e) })
    }
  }

  const loading = loadingTables || loadingEntities

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")
  const [newDbName, setNewDbName] = useState("")
  const [creating, setCreating] = useState(false)
  const createInputRef = useRef<HTMLInputElement>(null)

  const filteredDbs = (databases ?? []).filter((db) =>
    db.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  const [schemaPickerOpen, setSchemaPickerOpen] = useState(false)
  const [schemaSearch, setSchemaSearch] = useState("")
  const filteredSchemas = (schemas ?? []).filter((s) =>
    s.toLowerCase().includes(schemaSearch.toLowerCase())
  )

  function selectDb(db: string) {
    onDatabaseChange(db)
    setPickerOpen(false)
    setPickerSearch("")
  }

  const hasSchemas = (schemas?.length ?? 0) > 0 && onSchemaChange

  const canCreateDatabase = driver !== "postgres"

  const identQuote = driver === "postgres" ? `"` : "`"
  function quoteIdent(name: string) {
    if (identQuote === "`") return `\`${name.replaceAll("`", "``")}\``
    return `"${name.replaceAll(`"`, `""`)}"`
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

  useEffect(() => {
    if (!schemaPickerOpen) {
      setSchemaSearch("")
    }
  }, [schemaPickerOpen])

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

          {canCreateDatabase && (
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
          )}
        </DialogContent>
      </Dialog>

      {hasSchemas && (
        <div className="px-2 pb-2">
          <button
            onClick={() => setSchemaPickerOpen(true)}
            className="flex h-8 w-full items-center gap-1.5 rounded-md border bg-transparent px-2.5 text-xs transition-colors hover:bg-accent"
          >
            <Database className="text-muted-foreground size-3.5 shrink-0" />
            <span className="flex-1 truncate text-left">{schema || "Select schema"}</span>
            <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
          </button>
        </div>
      )}

      {hasSchemas && (
        <Dialog open={schemaPickerOpen} onOpenChange={setSchemaPickerOpen}>
          <DialogContent className="gap-0 p-0 sm:max-w-sm">
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle className="text-sm">Switch schema</DialogTitle>
            </DialogHeader>

            <div className="border-b px-3 py-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
                <Input
                  autoFocus
                  value={schemaSearch}
                  onChange={(e) => setSchemaSearch(e.target.value)}
                  placeholder="Search schemas…"
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </div>

            <ScrollArea className="max-h-64">
              <ul className="p-1">
                {filteredSchemas.length === 0 && (
                  <li className="text-muted-foreground px-3 py-2 text-xs">No results.</li>
                )}
                {filteredSchemas.map((s) => (
                  <li key={s}>
                    <button
                      onClick={() => { onSchemaChange?.(s); setSchemaPickerOpen(false) }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-xs transition-colors",
                        s === schema
                          ? "bg-accent text-accent-foreground font-medium"
                          : "hover:bg-accent/50"
                      )}
                    >
                      <Database className="text-muted-foreground size-3.5 shrink-0" />
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}

      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter objects"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="text-muted-foreground px-3 py-2 text-xs">Loading…</div>
        ) : (
          <div className="pb-2">
            {filtered.length > 0 && (
              <section className="px-1">
                <button
                  type="button"
                  onClick={() => toggleSection("tables")}
                  className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wide"
                >
                  {collapsed.tables ? (
                    <ChevronRight className="size-3 shrink-0" />
                  ) : (
                    <ChevronDown className="size-3 shrink-0" />
                  )}
                  Tables ({filtered.length})
                </button>
                {!collapsed.tables && (
                  <ul>
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
                          <ContextMenuItem onClick={() => onOpenTable(t.name, "structure")}>
                            Open Structure
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => onDestructive(`TRUNCATE TABLE ${quoteIdent(t.name)}`)}
                          >
                            Truncate
                          </ContextMenuItem>
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => onDestructive(`DROP TABLE ${quoteIdent(t.name)}`)}
                          >
                            Drop
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {ENTITY_SECTIONS.map(({ kind, label, icon: Icon }) => {
              const items = entitiesByKind.get(kind)
              if (!items?.length) return null
              const isCollapsed = collapsed[kind] ?? true
              return (
                <section key={kind} className="px-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(kind)}
                    className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wide"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="size-3 shrink-0" />
                    ) : (
                      <ChevronDown className="size-3 shrink-0" />
                    )}
                    {label} ({items.length})
                  </button>
                  {!isCollapsed && (
                    <ul>
                      {items.map((entity) => {
                        const id = entityTabId(entity)
                        return (
                          <ContextMenu key={id}>
                            <ContextMenuTrigger asChild>
                              <li>
                                <button
                                  onClick={() => onOpenEntity(entity)}
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors",
                                    activeEntityId === id
                                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                      : "hover:bg-sidebar-accent/50"
                                  )}
                                >
                                  <Icon className="text-muted-foreground size-3.5 shrink-0" />
                                  <span className="min-w-0 flex-1 truncate">{entity.name}</span>
                                  {entity.extra && (
                                    <span className="text-muted-foreground max-w-[40%] truncate text-[10px]">
                                      {entity.extra}
                                    </span>
                                  )}
                                </button>
                              </li>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-48">
                              <ContextMenuItem onClick={() => onOpenEntity(entity)}>
                                Open
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() => onOpenEntity(entity, "definition")}
                              >
                                Open Definition
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem onClick={() => copyCreate(entity)}>
                                Copy CREATE statement
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        )
                      })}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
