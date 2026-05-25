import { useEffect, useState } from "react"
import { ChevronLeft, Lock, LogOut, Settings as SettingsIcon, SquareTerminal, Table2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sidebar } from "@/components/Sidebar"
import { TableView } from "@/pages/TableView"
import { StructureView } from "@/pages/StructureView"
import { SqlEditor } from "@/pages/SqlEditor"
import { Settings } from "@/pages/Settings"
import { DestructiveOpModal } from "@/components/DestructiveOpModal"
import { TransactionBar, type TxEntry } from "@/components/TransactionBar"
import { ModeToggle } from "@/components/mode-toggle"
import { Logo } from "@/components/Logo"
import { cn } from "@/lib/utils"
import { useShortcuts } from "@/lib/useShortcuts"
import { api } from "@/lib/api"
import type { AppSettings, ConnectionMeta, TableSummary } from "@/lib/types"

type Tab =
  | { id: string; kind: "table"; table: string; sub: "data" | "structure" }
  | { id: string; kind: "sql" }

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
  onClose: () => void
}

export function Workspace({ connection, onClose }: WorkspaceProps) {
  const [databases, setDatabases] = useState<string[]>([])
  const [database, setDatabase] = useState(connection.default_database)
  const [tables, setTables] = useState<TableSummary[]>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [tabsByDb, setTabsByDb] = useState<Record<string, Tab[]>>({})
  const [activeByDb, setActiveByDb] = useState<Record<string, string | null>>({})

  const tabs = tabsByDb[database] ?? []
  const activeId = activeByDb[database] ?? null

  function setDbTabs(db: string, updater: (prev: Tab[]) => Tab[]) {
    setTabsByDb((prev) => ({ ...prev, [db]: updater(prev[db] ?? []) }))
  }
  function setDbActive(db: string, id: string | null) {
    setActiveByDb((prev) => ({ ...prev, [db]: id }))
  }

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
    if (!database) return
    setLoadingTables(true)
    api
      .listTables(database)
      .then((t) => setTables(t ?? []))
      .catch((e) => toast.error("Failed to list tables", { description: String(e) }))
      .finally(() => setLoadingTables(false))
  }, [database, dataVersion])

  // Load table→columns for SQL-editor autocomplete (one round trip per
  // database; refreshed after mutations in case DDL changed the schema).
  useEffect(() => {
    if (!database) {
      setSchema({})
      return
    }
    api
      .schemaColumns(database)
      .then((s) => setSchema(s ?? {}))
      .catch(() => setSchema({}))
  }, [database, dataVersion])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings>({
    allow_destructive_without_where: false,
    default_transaction_mode: "auto_commit",
    theme: "system",
  })
  const [readOnly, setReadOnly] = useState(connection.read_only)

  const [serverVersion, setServerVersion] = useState("")
  const [pending, setPending] = useState<PendingDestructive | null>(null)
  const [txEntries, setTxEntries] = useState<TxEntry[]>([])
  let txSeq = 0

  // Load persisted settings and server version from the backend.
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {})
    api.serverVersion().then(setServerVersion).catch(() => {})
  }, [])

  async function createDatabase(name: string) {
    const escaped = name.replaceAll("`", "``")
    await api.executeRaw(`CREATE DATABASE \`${escaped}\``, { bypass_destructive_check: false })
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

  function openTable(table: string, sub: "data" | "structure" = "data") {
    const existing = tabs.find((t) => t.kind === "table" && t.table === table)
    if (existing) {
      if (existing.kind === "table" && existing.sub !== sub) setSub(existing.id, sub)
      setDbActive(database, existing.id)
      return
    }
    const id = `table:${table}`
    setDbTabs(database, (prev) => [...prev, { id, kind: "table", table, sub }])
    setDbActive(database, id)
  }

  function openSql() {
    const existing = tabs.find((t) => t.kind === "sql")
    if (existing) {
      setDbActive(database, existing.id)
      return
    }
    setDbTabs(database, (prev) => [...prev, { id: "sql", kind: "sql" }])
    setDbActive(database, "sql")
  }

  function closeTab(id: string) {
    setDbTabs(database, (prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (id === activeId) setDbActive(database, next.at(-1)?.id ?? null)
      return next
    })
  }

  function setSub(id: string, sub: "data" | "structure") {
    setDbTabs(database, (prev) =>
      prev.map((t) => (t.id === id && t.kind === "table" ? { ...t, sub } : t))
    )
  }

  // Move the active tab by `dir` (wrapping), for ⌘⇧[ / ⌘⇧].
  function cycleTab(dir: 1 | -1) {
    if (tabs.length < 2) return
    const i = tabs.findIndex((t) => t.id === activeId)
    const next = (Math.max(i, 0) + dir + tabs.length) % tabs.length
    setDbActive(database, tabs[next].id)
  }
  // Jump to the nth (1-based) tab, for ⌘1–⌘9.
  function gotoTab(n: number) {
    const t = tabs[n - 1]
    if (t) setDbActive(database, t.id)
  }

  function handleMutate(label = "Statement executed") {
    if (settings.default_transaction_mode === "explicit_commit") {
      setTxEntries((prev) => [...prev, { id: txSeq++, at: new Date(), label }])
    }
  }

  function afterMutation() {
    setDataVersion((v) => v + 1)
  }

  // Raw SQL (TRUNCATE/DROP/ALTER from the sidebar & structure view) routes
  // through the server-side destructive check, which decides block vs. confirm.
  async function runRawSQL(sql: string) {
    try {
      const res = await api.executeRaw(sql, { bypass_destructive_check: false, database })
      if (res.status === "destructive_blocked") {
        setPending({ sql, blocked: true, run: async () => {} })
      } else if (res.status === "destructive_confirm") {
        setPending({
          sql,
          blocked: false,
          run: async () => {
            await api.executeRaw(sql, { bypass_destructive_check: true, database })
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

  // App-level shortcuts (TablePlus-style). Table-/editor-specific bindings live
  // in their own components, scoped to the visible tab.
  useShortcuts([
    { key: "t", meta: true, handler: openSql },
    { key: "w", meta: true, handler: () => activeId && closeTab(activeId) },
    { code: "BracketRight", meta: true, shift: true, handler: () => cycleTab(1) },
    { code: "BracketLeft", meta: true, shift: true, handler: () => cycleTab(-1) },
    ...Array.from({ length: 9 }, (_, i) => ({
      key: String(i + 1),
      meta: true,
      handler: () => gotoTab(i + 1),
    })),
  ])

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex h-10 items-center gap-2 border-b px-2">
        <Button variant="ghost" size="icon" className="size-7" onClick={async () => { if (txEntries.length > 0) await api.rollbackTransaction().catch(() => {}); onClose() }} title="All connections">
          <ChevronLeft className="size-4" />
        </Button>
        <Logo className="size-6 rounded" />
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
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setSettingsOpen(true)}
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
            title="Disconnect"
          >
            <LogOut className="size-4" />
          </Button>
          <ModeToggle />
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          databases={databases}
          database={database}
          onDatabaseChange={setDatabase}
          onCreateDatabase={createDatabase}
          tables={tables}
          loadingTables={loadingTables}
          activeTable={activeTable}
          onOpenTable={openTable}
          onDestructive={runRawSQL}
        />
        <div className="flex min-w-0 flex-1 flex-col">
            {/* Tab strip */}
            <div className="flex items-center gap-1 overflow-x-auto border-b px-1.5 pt-1">
              {tabs.length === 0 && (
                <span className="text-muted-foreground px-2 py-1.5 text-xs">
                  Select a table from the sidebar to begin.
                </span>
              )}
              {tabs.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setDbActive(database, t.id)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-1.5 rounded-t border border-b-0 px-2.5 py-1 text-xs whitespace-nowrap",
                    t.id === activeId ? "bg-background" : "bg-muted/40 text-muted-foreground"
                  )}
                >
                  {t.kind === "table" ? (
                    <Table2 className="size-3.5" />
                  ) : (
                    <SquareTerminal className="size-3.5" />
                  )}
                  {t.kind === "table" ? t.table : "SQL Editor"}
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

            {/* Data/Structure sub-toggle for table tabs */}
            {active?.kind === "table" && (
              <div className="bg-muted/20 flex items-center gap-1 border-b px-2 py-1">
                {(["data", "structure"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSub(active.id, s)}
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
                          database={database}
                          table={t.table}
                          active={t.id === activeId && t.sub === "data"}
                          totalRows={tables.find((tb) => tb.name === t.table)?.row_count ?? 0}
                          dataVersion={dataVersion}
                          confirmDestructive={confirmDestructive}
                          onMutate={handleMutate}
                        />
                      </div>
                      <div className={cn("h-full", t.sub !== "structure" && "hidden")}>
                        <StructureView
                          database={database}
                          table={t.table}
                          onDestructive={runRawSQL}
                        />
                      </div>
                    </>
                  ) : (
                    <SqlEditor database={database} schema={schema} onMutate={handleMutate} onDestructive={runRawSQL} />
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
                    setTxEntries([])
                    afterMutation()
                    toast.success("Transaction rolled back")
                  } catch (e) {
                    toast.error("Rollback failed", { description: String(e) })
                  }
                }}
              />
            )}
          </div>
        </div>

      {/* Status bar */}
      <footer className="bg-muted/40 text-muted-foreground flex h-6 items-center gap-3 border-t px-3 text-[11px]">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Connected
        </span>
        {serverVersion && <span>MySQL {serverVersion}</span>}
        <span className="ml-auto tabular-nums">
          {database} · {connection.host}:{connection.port}
        </span>
      </footer>

      <Settings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={changeSettings}
        connectionReadOnly={readOnly}
        onConnectionReadOnlyChange={setReadOnly}
      />

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
