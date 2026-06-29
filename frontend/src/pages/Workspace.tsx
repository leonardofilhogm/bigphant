import { useEffect, useRef, useState } from "react"
import { CableIcon, Eye, Lock, LockOpen, LogOut, PanelLeft, Settings as SettingsIcon, Sparkles, SquareTerminal, Table2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EditModeDialog } from "@/components/EditModeDialog"
import { LicensePanel } from "@/components/LicensePanel"
import { Sidebar } from "@/components/Sidebar"
import { TableOverview } from "@/components/TableOverview"
import { TableView } from "@/pages/TableView"
import { StructureView } from "@/pages/StructureView"
import { SqlEditor } from "@/pages/SqlEditor"
import { AIAssistant } from "@/components/AIAssistant"
import { UserManager } from "@/components/maintenance/UserManager"
import { DatabaseCreator } from "@/components/maintenance/DatabaseCreator"
import { ServerActivity } from "@/components/maintenance/ServerActivity"
import { MaintenanceTools } from "@/components/maintenance/MaintenanceTools"
import { Settings } from "@/pages/Settings"
import { DestructiveOpModal } from "@/components/DestructiveOpModal"
import { TransactionBar, type TxEntry } from "@/components/TransactionBar"
import { ModeToggle } from "@/components/mode-toggle"
import { DriverLogo } from "@/components/DriverLogo"
import { OpenConnectionDialog } from "@/components/OpenConnectionDialog"
import { TableSwitcher } from "@/components/TableSwitcher"
import { ConnectionFormDialog } from "@/pages/ConnectionList"
import { entityTabId, EntityDefinitionView } from "@/components/EntityDefinition"
import { cn } from "@/lib/utils"
import { useShortcuts } from "@/lib/useShortcuts"
import { useMenuEvents } from "@/lib/useMenuEvents"
import { api } from "@/lib/api"
import type { LicenseInfo } from "@/lib/license-types"
import type { AppSettings, ConnectionMeta, EditMode, Entity, TableSummary } from "@/lib/types"

type Tab =
  | { id: string; kind: "table"; table: string; sub: "data" | "structure" }
  | { id: string; kind: "view"; entity: Entity; sub: "data" | "definition" }
  | { id: string; kind: "definition"; entity: Entity }
  | { id: string; kind: "sql" }
  | { id: string; kind: "ai" }

// A destructive statement awaiting confirmation in the modal. `run` performs
// the actual execution once the user confirms; `blocked` means the server
// refused it (Settings → allow destructive without WHERE is off).
interface PendingDestructive {
  sql: string
  blocked: boolean
  run: () => Promise<void>
}

interface WorkspaceProps {
  connection: ConnectionMeta
  license: LicenseInfo | null
  /** Whether this is the visible connection. Background (kept-alive) workspaces
   *  stay mounted but hidden, so their shortcuts must not fire. */
  isActive: boolean
  onPlanRequired: (message: string) => void
  onClose: () => void
  /** Switches the window to a different connection, keeping this one's state
   *  alive in the background. */
  onSwitch: (connection: ConnectionMeta) => void
  onManageLicense?: () => void
  onReplayWelcome?: () => void
  onLicenseSignOut?: () => void
}

// Row-editing method shown as a single icon on the topbar (lock metaphor):
// locked = side panel only, lock open = mixed, table = inline.
const EDIT_MODE_META = {
  inline: { Icon: Table2, label: "Inline only" },
  mixed: { Icon: LockOpen, label: "Mixed" },
  side_panel: { Icon: Lock, label: "Side panel" },
} as const

export function Workspace({
  connection,
  license,
  isActive,
  onPlanRequired,
  onClose,
  onSwitch,
  onManageLicense,
  onReplayWelcome,
  onLicenseSignOut,
}: WorkspaceProps) {
  const canExport = license?.features.export ?? false
  const canModifySchema = license?.features.modify_schema ?? false
  const [databases, setDatabases] = useState<string[]>([])
  const [database, setDatabase] = useState(connection.default_database)
  const [schemas, setSchemas] = useState<string[]>([])
  const [schemaName, setSchemaName] = useState(connection.driver === "postgres" ? "public" : "")
  const [tables, setTables] = useState<TableSummary[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [tabsByDb, setTabsByDb] = useState<Record<string, Tab[]>>({})
  const [activeByDb, setActiveByDb] = useState<Record<string, string | null>>({})

  const tabKey = connection.driver === "postgres" ? `${database}.${schemaName}` : database
  const tabs = tabsByDb[tabKey] ?? []
  const activeId = activeByDb[tabKey] ?? null

  function setDbTabs(db: string, updater: (prev: Tab[]) => Tab[]) {
    setTabsByDb((prev) => ({ ...prev, [db]: updater(prev[db] ?? []) }))
  }
  function setDbActive(db: string, id: string | null) {
    setActiveByDb((prev) => ({ ...prev, [db]: id }))
  }

  const namespace = connection.driver === "postgres" ? schemaName : database

  function refreshDatabases() {
    return api
      .listDatabases()
      .then((dbs) => {
        const list = dbs ?? []
        setDatabases(list)
        setDatabase((cur) => cur || list[0] || "")
      })
      .catch((e) => toast.error("Failed to list databases", { description: String(e) }))
  }

  // Load the database list once the (already opened) connection is active.
  useEffect(() => { refreshDatabases() }, [])

  const [dataVersion, setDataVersion] = useState(0)
  const [schema, setSchema] = useState<Record<string, string[]>>({})

  // Load tables when the database changes or after a mutation (refreshes counts).
  useEffect(() => {
    if (!namespace) return
    setLoadingTables(true)
    api
      .listTables(namespace)
      .then((t) => setTables(t ?? []))
      .catch((e) => toast.error("Failed to list tables", { description: String(e) }))
      .finally(() => setLoadingTables(false))
  }, [namespace, dataVersion])

  // Load non-table entities (views, routines, …) for the sidebar.
  useEffect(() => {
    if (!namespace) return
    setLoadingEntities(true)
    api
      .listEntities(namespace)
      .then((e) => setEntities(e ?? []))
      .catch((e) => toast.error("Failed to list entities", { description: String(e) }))
      .finally(() => setLoadingEntities(false))
  }, [namespace, dataVersion])

  // Load table→columns for SQL-editor autocomplete (one round trip per
  // database; refreshed after mutations in case DDL changed the schema).
  useEffect(() => {
    if (!namespace) {
      setSchema({})
      return
    }
    api
      .schemaColumns(namespace)
      .then((s) => setSchema(s ?? {}))
      .catch(() => setSchema({}))
  }, [namespace, dataVersion])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editModeOpen, setEditModeOpen] = useState(false)
  const [licenseOpen, setLicenseOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [tableSwitcherOpen, setTableSwitcherOpen] = useState(false)
  const [newConnOpen, setNewConnOpen] = useState(false)
  const [maintUsersOpen, setMaintUsersOpen] = useState(false)
  const [maintDatabaseOpen, setMaintDatabaseOpen] = useState(false)
  const [maintActivityOpen, setMaintActivityOpen] = useState(false)
  const [maintToolsOpen, setMaintToolsOpen] = useState(false)

  // Switches this window to another saved connection without dropping to the
  // connection-list screen. Rolls back any open transaction first, swaps the
  // backend pool, then re-keys the workspace (App remounts on connection.id).
  async function switchConnection(next: ConnectionMeta) {
    if (txEntries.length > 0) await api.rollbackTransaction().catch(() => {})
    await api.openConnection(next.id)
    onSwitch(next)
  }
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settings, setSettings] = useState<AppSettings>({
    allow_destructive_without_where: false,
    default_transaction_mode: "auto_commit",
    theme: "system",
    onboarding_completed: true,
  })
  const [readOnly, setReadOnly] = useState(connection.read_only)
  // Row-editing method for this connection's grids. Persisted per connection so
  // the choice survives reopening; the backend defaults blanks to "mixed".
  const [editMode, setEditMode] = useState<EditMode>(
    (connection.edit_mode as EditMode) || "mixed"
  )

  function changeEditMode(mode: EditMode) {
    setEditMode(mode)
    api
      .setConnectionEditMode(connection.id, mode)
      .catch((e) => toast.error("Failed to save editing mode", { description: String(e) }))
  }

  const [serverVersion, setServerVersion] = useState("")
  const [serverFlavor, setServerFlavor] = useState("MySQL")
  const [pending, setPending] = useState<PendingDestructive | null>(null)
  const [txEntries, setTxEntries] = useState<TxEntry[]>([])
  const [txVersion, setTxVersion] = useState(0)
  const txSeq = useRef(0)

  // Whether the *active connection* runs in explicit-commit mode. This must
  // match what the backend pool actually uses (set from the connection's own
  // transaction_mode at OpenConnection — internal/mysql/pool.go), NOT the global
  // settings.default_transaction_mode, or the Commit/Rollback bar desyncs from
  // the open transaction and leaves rows locked with no way to release them.
  const isExplicit = connection.transaction_mode === "explicit_commit"

  // Load persisted settings and server version from the backend.
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {})
    api.serverVersion().then(setServerVersion).catch(() => {})
    api.serverFlavor().then(setServerFlavor).catch(() => {})
  }, [])

  async function createDatabase(name: string) {
    if (connection.driver === "postgres") return
    const escaped = name.replaceAll("`", "``")
    await api.executeRaw(`CREATE DATABASE \`${escaped}\``, { bypass_destructive_check: false, database: "" })
    await refreshDatabases()
    toast.success(`Database \`${name}\` created`)
  }

  function changeSettings(next: AppSettings) {
    setSettings(next)
    api
      .updateSettings(next)
      .catch((e) => toast.error("Failed to save settings", { description: String(e) }))
  }

  const active = tabs.find((t) => t.id === activeId) ?? null
  const activeTable = active?.kind === "table" ? active.table : null
  const activeEntityId =
    active?.kind === "view" || active?.kind === "definition" ? active.id : null

  function viewFetchName(entity: Entity): string {
    if (entity.kind === "function" || entity.kind === "procedure") {
      const i = entity.name.indexOf("(")
      return i >= 0 ? entity.name.slice(0, i) : entity.name
    }
    return entity.name
  }

  function openEntity(entity: Entity, sub: "data" | "definition" = "data") {
    const isView = entity.kind === "view" || entity.kind === "materialized_view"
    if (isView) {
      const id = entityTabId(entity)
      const existing = tabs.find((t) => t.id === id)
      if (existing) {
        if (existing.kind === "view" && existing.sub !== sub) {
          setEntitySub(existing.id, sub)
        }
        setDbActive(tabKey, existing.id)
        return
      }
      setDbTabs(tabKey, (prev) => [
        ...prev,
        { id, kind: "view", entity, sub: sub === "definition" ? "definition" : "data" },
      ])
      setDbActive(tabKey, id)
      return
    }

    const id = entityTabId(entity)
    const existing = tabs.find((t) => t.id === id)
    if (existing) {
      setDbActive(tabKey, existing.id)
      return
    }
    setDbTabs(tabKey, (prev) => [...prev, { id, kind: "definition", entity }])
    setDbActive(tabKey, id)
  }

  function setEntitySub(id: string, sub: "data" | "definition") {
    setDbTabs(tabKey, (prev) =>
      prev.map((t) => (t.id === id && t.kind === "view" ? { ...t, sub } : t))
    )
  }

  function openTable(table: string, sub: "data" | "structure" = "data") {
    const existing = tabs.find((t) => t.kind === "table" && t.table === table)
    if (existing) {
      if (existing.kind === "table" && existing.sub !== sub) setSub(existing.id, sub)
      setDbActive(tabKey, existing.id)
      return
    }
    const id = `table:${table}`
    setDbTabs(tabKey, (prev) => [...prev, { id, kind: "table", table, sub }])
    setDbActive(tabKey, id)
  }

  function openSql() {
    const existing = tabs.find((t) => t.kind === "sql")
    if (existing) {
      setDbActive(tabKey, existing.id)
      return
    }
    setDbTabs(tabKey, (prev) => [...prev, { id: "sql", kind: "sql" }])
    setDbActive(tabKey, "sql")
  }

  function openAI() {
    const existing = tabs.find((t) => t.kind === "ai")
    if (existing) {
      setDbActive(tabKey, existing.id)
      return
    }
    setDbTabs(tabKey, (prev) => [...prev, { id: "ai", kind: "ai" }])
    setDbActive(tabKey, "ai")
  }

  function closeTab(id: string) {
    setDbTabs(tabKey, (prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (id === activeId) setDbActive(tabKey, next.at(-1)?.id ?? null)
      return next
    })
  }

  function closeAllTabs() {
    setDbTabs(tabKey, () => [])
    setDbActive(tabKey, null)
  }

  function handleStructureChange(tableName: string, renamedTo?: string) {
    setDataVersion((v) => v + 1)
    if (renamedTo) {
      setDbTabs(tabKey, (prev) =>
        prev.map((t) =>
          t.kind === "table" && t.table === tableName
            ? { ...t, id: `table:${renamedTo}`, table: renamedTo }
            : t
        )
      )
    }
  }

  function setSub(id: string, sub: "data" | "structure") {
    setDbTabs(tabKey, (prev) =>
      prev.map((t) => (t.id === id && t.kind === "table" ? { ...t, sub } : t))
    )
  }

  // Move the active tab by `dir` (wrapping), for ⌘⇧[ / ⌘⇧].
  function cycleTab(dir: 1 | -1) {
    if (tabs.length < 2) return
    const i = tabs.findIndex((t) => t.id === activeId)
    const next = (Math.max(i, 0) + dir + tabs.length) % tabs.length
    setDbActive(tabKey, tabs[next].id)
  }
  // Jump to the nth (1-based) tab, for ⌘1–⌘9.
  function gotoTab(n: number) {
    const t = tabs[n - 1]
    if (t) setDbActive(tabKey, t.id)
  }

  function handleMutate(label = "Statement executed") {
    if (isExplicit) {
      setTxEntries((prev) => [...prev, { id: txSeq.current++, at: new Date(), label }])
    }
  }

  function afterMutation() {
    setDataVersion((v) => v + 1)
  }

  // Raw SQL (TRUNCATE/DROP/ALTER from the sidebar & structure view) routes
  // through the server-side destructive check, which decides block vs. confirm.
  async function runRawSQL(sql: string) {
    try {
      const res = await api.executeRaw(sql, { bypass_destructive_check: false, database: namespace })
      if (res.status === "destructive_blocked") {
        setPending({ sql, blocked: true, run: async () => {} })
      } else if (res.status === "destructive_confirm") {
        setPending({
          sql,
          blocked: false,
          run: async () => {
            await api.executeRaw(sql, { bypass_destructive_check: true, database: namespace })
            toast.success("Statement executed")
            afterMutation()
          },
        })
      } else {
        toast.success(res.is_query ? "Query executed" : `${res.affected_rows} row(s) affected`)
        afterMutation()
      }
    } catch (e) {
      toast.error("Execution failed", { description: String(e) })
    }
  }

  async function changeDatabase(next: string) {
    if (connection.driver === "postgres") {
      try {
        await api.setActiveDatabase(next)
        setDatabase(next)
        setSchemas([])
        setSchemaName("public")
        setTables([])
        setDataVersion((v) => v + 1)
        api.serverVersion().then(setServerVersion).catch(() => {})
        api.serverFlavor().then(setServerFlavor).catch(() => {})
      } catch (e) {
        toast.error("Failed to switch database", { description: String(e) })
      }
      return
    }
    setDatabase(next)
  }

  // For Postgres, list schemas when the selected database changes.
  useEffect(() => {
    if (connection.driver !== "postgres") return
    if (!database) return
    api
      .listSchemas(database)
      .then((s) => {
        const list = s ?? []
        setSchemas(list)
        setSchemaName((cur) => cur || list[0] || "public")
      })
      .catch(() => {
        setSchemas([])
        setSchemaName("public")
      })
  }, [connection.driver, database])

  // Confirmation-only modal for typed multi-row deletes (always confirm, even
  // though they carry a WHERE — docs/prd.md §3.1 #14).
  function confirmDestructive(sql: string, run: () => Promise<void>) {
    setPending({
      sql,
      blocked: false,
      run: async () => {
        try {
          await run()
          afterMutation()
        } catch (e) {
          toast.error("Execution failed", { description: String(e) })
        }
      },
    })
  }

  // Tab navigation shortcuts. ⌘T/⌘B/⌘W/⇧⌘W now live in the native menu (File /
  // View) as the single source of truth — see menu.go and the useMenuEvents
  // below — so they're not duplicated here. ⌘1–9 / ⌘⇧[ ] stay in JS since
  // they're awkward as menu items.
  useShortcuts([
    { key: "p", meta: true, handler: () => setTableSwitcherOpen((o) => !o) },
    { key: "p", ctrl: true, handler: () => setTableSwitcherOpen((o) => !o) },
    { code: "BracketRight", meta: true, shift: true, handler: () => cycleTab(1) },
    { code: "BracketLeft", meta: true, shift: true, handler: () => cycleTab(-1) },
    ...Array.from({ length: 9 }, (_, i) => ({
      key: String(i + 1),
      meta: true,
      handler: () => gotoTab(i + 1),
    })),
  ], isActive)

  // Native-menu actions, scoped to the visible connection (isActive) so a
  // background kept-alive workspace never responds.
  useMenuEvents(
    {
      "menu:new-query": openSql,
      "menu:new-connection": () => setNewConnOpen(true),
      "menu:close-tab": () => activeId && closeTab(activeId),
      "menu:close-all-tabs": closeAllTabs,
      "menu:toggle-sidebar": () => setSidebarOpen((s) => !s),
      "menu:switch-connection": () => setSwitcherOpen(true),
      "menu:settings": () => setSettingsOpen(true),
      "menu:license": () => setLicenseOpen(true),
      "menu:maint-users": () => setMaintUsersOpen(true),
      "menu:maint-database": () => setMaintDatabaseOpen(true),
      "menu:maint-activity": () => setMaintActivityOpen(true),
      "menu:maint-tools": () => setMaintToolsOpen(true),
    },
    isActive
  )

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar — doubles as the window title bar (frameless macOS window);
          `titlebar-inset` clears the traffic lights, `titlebar-drag` makes the
          empty areas draggable while buttons opt out via CSS. */}
      <header className="titlebar-drag titlebar-inset flex h-12 items-center gap-2 border-b pr-2">
        <Button variant="ghost" size="icon" className="size-7" onClick={() => setSwitcherOpen(true)} title="Switch connection">
          <CableIcon className="size-4" />
        </Button>
        <DriverLogo driver={connection.driver} className="size-6 shrink-0 rounded object-contain" />
        <span className="text-sm font-semibold">{connection.name}</span>
        {connection.label && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: connection.label_color ? connection.label_color + "22" : "#6b728022",
              color: connection.label_color || "#6b7280",
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ background: connection.label_color || "#6b7280" }}
            />
            {connection.label}
          </span>
        )}
        {readOnly && (
          <Badge variant="secondary" className="h-4 gap-1 px-1.5 text-[10px]">
            <Lock className="size-2.5" /> read-only
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={openSql} title="New Query (⌘T)">
            <SquareTerminal className="size-3.5" /> New Query
            <span className="ml-0.5 opacity-60">⌘T</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={openAI} title="AI Assistant">
            <Sparkles className="size-3.5" /> Ask AI
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setEditModeOpen(true)}
            title={`Row editing: ${EDIT_MODE_META[editMode].label}`}
          >
            {(() => {
              const Icon = EDIT_MODE_META[editMode].Icon
              return <Icon className="size-4" />
            })()}
          </Button>
          {license && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setLicenseOpen(true)}
              title="License"
            >
              License
              <Badge
                variant={license.plan === "pro" ? "default" : "secondary"}
                className="h-4 px-1.5 text-[10px]"
              >
                {license.plan === "pro" ? "Pro" : "Free"}
              </Badge>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <SettingsIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-7"
            onClick={async () => {
              if (txEntries.length > 0) await api.rollbackTransaction().catch(() => {})
              onClose()
            }}
            title="Log out"
          >
            <LogOut className="size-4" />
          </Button>
          <ModeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setSidebarOpen((s) => !s)}
            title={sidebarOpen ? "Hide sidebar (⌘B)" : "Show sidebar (⌘B)"}
          >
            <PanelLeft className="size-4" />
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
        <Sidebar
          driver={connection.driver}
          namespace={namespace}
          databases={databases}
          database={database}
          onDatabaseChange={changeDatabase}
          onCreateDatabase={createDatabase}
          schemas={connection.driver === "postgres" ? schemas : undefined}
          schema={connection.driver === "postgres" ? schemaName : undefined}
          onSchemaChange={connection.driver === "postgres" ? setSchemaName : undefined}
          tables={tables}
          entities={entities}
          loadingTables={loadingTables}
          loadingEntities={loadingEntities}
          activeTable={activeTable}
          activeEntityId={activeEntityId}
          onOpenTable={openTable}
          onOpenEntity={openEntity}
          onDestructive={runRawSQL}
        />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {tabs.length === 0 ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <TableOverview
                key={tabKey}
                database={namespace}
                tables={tables}
                loading={loadingTables}
                onOpenTable={openTable}
                onDestructive={runRawSQL}
                identQuote={connection.driver === "postgres" ? '"' : "`"}
              />
            </div>
          ) : (
            <>
            {/* Tab strip */}
            <div className="flex items-center gap-1 overflow-x-auto border-b px-1.5 pt-1">
              {tabs.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setDbActive(tabKey, t.id)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-1.5 rounded-t border border-b-0 px-2.5 py-1 text-xs whitespace-nowrap",
                    t.id === activeId ? "bg-background" : "bg-muted/40 text-muted-foreground"
                  )}
                >
                  {t.kind === "table" ? (
                    <Table2 className="size-3.5" />
                  ) : t.kind === "view" ? (
                    <Eye className="size-3.5" />
                  ) : t.kind === "ai" ? (
                    <Sparkles className="size-3.5" />
                  ) : (
                    <SquareTerminal className="size-3.5" />
                  )}
                  {t.kind === "table"
                    ? t.table
                    : t.kind === "sql"
                      ? "SQL Editor"
                      : t.kind === "ai"
                        ? "AI Assistant"
                        : t.entity.name}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(t.id)
                    }}
                    className="opacity-0 group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Tables switch Data/Structure from the per-view bottom bar; views
                keep the Data/Definition toggle here. */}
            {active?.kind === "view" && (
              <div className="bg-muted/20 flex items-center gap-1 border-b px-2 py-1">
                {(["data", "definition"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setEntitySub(active.id, s)}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs capitalize transition-colors",
                      active.sub === s
                        ? "bg-background border shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Content — every tab stays mounted so its state (filters, paging,
                editor queries) survives switching tabs; only the active one is
                shown. Inactive tabs are hidden via CSS, not unmounted. */}
            <div className="min-h-0 flex-1">
              {tabs.map((t) => (
                <div key={t.id} className={cn("h-full", t.id !== activeId && "hidden")}>
                  {t.kind === "table" ? (
                    <>
                      <div className={cn("h-full", t.sub !== "data" && "hidden")}>
                        <TableView
                          database={namespace}
                          table={t.table}
                          active={isActive && t.id === activeId && t.sub === "data"}
                          totalRows={tables.find((tb) => tb.name === t.table)?.row_count ?? 0}
                          dataVersion={dataVersion}
                          confirmDestructive={confirmDestructive}
                          onMutate={handleMutate}
                          isExplicit={isExplicit}
                          txVersion={txVersion}
                          canExport={canExport}
                          onPlanRequired={onPlanRequired}
                          editMode={editMode}
                          sub={t.sub}
                          subOptions={["data", "structure"]}
                          onSubChange={(s) => setSub(t.id, s as "data" | "structure")}
                        />
                      </div>
                      <div className={cn("h-full", t.sub !== "structure" && "hidden")}>
                        <StructureView
                          database={namespace}
                          table={t.table}
                          driver={connection.driver}
                          canModifySchema={canModifySchema}
                          onPlanRequired={onPlanRequired}
                          onStructureChange={(renamedTo) => handleStructureChange(t.table, renamedTo)}
                          sub={t.sub}
                          subOptions={["data", "structure"]}
                          onSubChange={(s) => setSub(t.id, s as "data" | "structure")}
                        />
                      </div>
                    </>
                  ) : t.kind === "view" ? (
                    <>
                      <div className={cn("h-full", t.sub !== "data" && "hidden")}>
                        <TableView
                          database={namespace}
                          table={viewFetchName(t.entity)}
                          active={isActive && t.id === activeId && t.sub === "data"}
                          totalRows={0}
                          dataVersion={dataVersion}
                          confirmDestructive={confirmDestructive}
                          onMutate={handleMutate}
                          isExplicit={isExplicit}
                          txVersion={txVersion}
                          readOnly
                        />
                      </div>
                      <div className={cn("h-full", t.sub !== "definition" && "hidden")}>
                        <EntityDefinitionView
                          database={namespace}
                          driver={connection.driver}
                          entity={t.entity}
                        />
                      </div>
                    </>
                  ) : t.kind === "definition" ? (
                    <EntityDefinitionView
                      database={namespace}
                      driver={connection.driver}
                      entity={t.entity}
                    />
                  ) : t.kind === "ai" ? (
                    <AIAssistant database={namespace} active={isActive && t.id === activeId} />
                  ) : (
                    <SqlEditor database={namespace} schema={schema} onMutate={handleMutate} onDestructive={runRawSQL} />
                  )}
                </div>
              ))}
            </div>

            {txEntries.length > 0 && (
              <TransactionBar
                entries={txEntries}
                onCommit={async () => {
                  try {
                    await api.commitTransaction()
                    setTxVersion((v) => v + 1)
                    setTxEntries([])
                    afterMutation()
                    toast.success("Transaction committed")
                  } catch (e) {
                    toast.error("Commit failed", { description: String(e) })
                  }
                }}
                onRollback={async () => {
                  try {
                    await api.rollbackTransaction()
                    setTxVersion((v) => v + 1)
                    setTxEntries([])
                    afterMutation()
                    toast.success("Transaction rolled back")
                  } catch (e) {
                    toast.error("Rollback failed", { description: String(e) })
                  }
                }}
              />
            )}
            </>
          )}
          </div>
        </div>

      {/* Status bar */}
      <footer className="bg-muted/40 text-muted-foreground flex h-6 items-center gap-3 border-t px-3 text-[11px]">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Connected
        </span>
        {serverVersion && <span>{serverFlavor} {serverVersion}</span>}
        <span className="ml-auto tabular-nums">
          {connection.driver === "sqlite"
            ? connection.file_path
            : `${connection.driver === "postgres" ? `${database}.${schemaName}` : database} · ${connection.host}:${connection.port}`}
        </span>
      </footer>

      <Settings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={changeSettings}
        connectionReadOnly={readOnly}
        onConnectionReadOnlyChange={setReadOnly}
        onReplayWelcome={onReplayWelcome}
      />

      <EditModeDialog
        open={editModeOpen}
        onOpenChange={setEditModeOpen}
        value={editMode}
        onChange={changeEditMode}
      />

      <UserManager
        open={maintUsersOpen}
        onOpenChange={setMaintUsersOpen}
        driver={connection.driver}
        database={database}
        canModifySchema={canModifySchema}
        onPlanRequired={onPlanRequired}
      />
      <DatabaseCreator
        open={maintDatabaseOpen}
        onOpenChange={setMaintDatabaseOpen}
        driver={connection.driver}
        database={database}
        canModifySchema={canModifySchema}
        onPlanRequired={onPlanRequired}
        onSuccess={refreshDatabases}
      />
      <ServerActivity
        open={maintActivityOpen}
        onOpenChange={setMaintActivityOpen}
        driver={connection.driver}
        database={database}
        canModifySchema={canModifySchema}
        onPlanRequired={onPlanRequired}
      />
      <MaintenanceTools
        open={maintToolsOpen}
        onOpenChange={setMaintToolsOpen}
        driver={connection.driver}
        database={database}
        canModifySchema={canModifySchema}
        onPlanRequired={onPlanRequired}
      />

      <TableSwitcher
        open={tableSwitcherOpen}
        onOpenChange={setTableSwitcherOpen}
        tables={tables}
        entities={entities}
        onOpenTable={openTable}
        onOpenEntity={openEntity}
      />

      <OpenConnectionDialog
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        currentId={connection.id}
        onOpenConnection={switchConnection}
        onPlanRequired={onPlanRequired}
      />

      {newConnOpen && (
        <ConnectionFormDialog
          mode="create"
          forceOpen
          onPlanRequired={onPlanRequired}
          onClose={() => setNewConnOpen(false)}
          onSaved={() => setNewConnOpen(false)}
        />
      )}

      <Dialog open={licenseOpen} onOpenChange={setLicenseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>License</DialogTitle>
            <DialogDescription>View your plan, devices, and manage activation.</DialogDescription>
          </DialogHeader>
          <LicensePanel
            onChangeLicense={
              onManageLicense
                ? () => {
                    setLicenseOpen(false)
                    onManageLicense()
                  }
                : undefined
            }
            onSignOut={() => {
              setLicenseOpen(false)
              ;(onLicenseSignOut ?? onClose)()
            }}
          />
        </DialogContent>
      </Dialog>

      <DestructiveOpModal
        sql={pending?.sql ?? null}
        blocked={pending?.blocked ?? false}
        onConfirm={() => {
          const action = pending
          setPending(null)
          action?.run()
        }}
        onClose={() => setPending(null)}
      />
    </div>
  )
}
