import { useEffect, useState } from "react"
import { ChevronLeft, Lock, Settings as SettingsIcon, SquareTerminal, Table2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sidebar } from "@/components/Sidebar"
import { TableView } from "@/pages/TableView"
import { StructureView } from "@/pages/StructureView"
import { SqlEditor } from "@/pages/SqlEditor"
import { Settings } from "@/pages/Settings"
import { DestructiveOpModal } from "@/components/DestructiveOpModal"
import { TransactionBar } from "@/components/TransactionBar"
import { ModeToggle } from "@/components/mode-toggle"
import { cn } from "@/lib/utils"
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
        setDatabases(dbs)
        setDatabase((cur) => cur || dbs[0] || "")
      })
      .catch((e) => toast.error("Failed to list databases", { description: String(e) }))
  }

  // Load the database list once the (already opened) connection is active.
  useEffect(() => { refreshDatabases() }, [])

  const [dataVersion, setDataVersion] = useState(0)

  // Load tables when the database changes or after a mutation (refreshes counts).
  useEffect(() => {
    if (!database) return
    setLoadingTables(true)
    api
      .listTables(database)
      .then(setTables)
      .catch((e) => toast.error("Failed to list tables", { description: String(e) }))
      .finally(() => setLoadingTables(false))
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
  const [txPending, setTxPending] = useState(0)

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

  function openTable(table: string) {
    const existing = tabs.find((t) => t.kind === "table" && t.table === table)
    if (existing) {
      setDbActive(database, existing.id)
      return
    }
    const id = `table:${table}`
    setDbTabs(database, (prev) => [...prev, { id, kind: "table", table, sub: "data" }])
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

  function handleMutate() {
    if (settings.default_transaction_mode === "explicit_commit") {
      setTxPending((n) => n + 1)
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

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex h-10 items-center gap-2 border-b px-2">
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} title="Connections">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{connection.name}</span>
        <span className="text-muted-foreground text-xs">
          {connection.username}@{connection.host}:{connection.port}
        </span>
        {readOnly && (
          <Badge variant="secondary" className="h-4 gap-1 px-1.5 text-[10px]">
            <Lock className="size-2.5" /> read-only
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={openSql}>
            <SquareTerminal className="size-3.5" /> New Query
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon className="size-4" />
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

            {/* Content */}
            <div className="min-h-0 flex-1">
              {active?.kind === "table" && active.sub === "data" && (
                <TableView
                  database={database}
                  table={active.table}
                  dataVersion={dataVersion}
                  confirmDestructive={confirmDestructive}
                  onMutate={handleMutate}
                />
              )}
              {active?.kind === "table" && active.sub === "structure" && (
                <StructureView
                  database={database}
                  table={active.table}
                  onDestructive={runRawSQL}
                />
              )}
              {active?.kind === "sql" && (
                <SqlEditor database={database} onMutate={handleMutate} onDestructive={runRawSQL} />
              )}
            </div>

            {txPending > 0 && (
              <TransactionBar
                pendingStatements={txPending}
                onCommit={() => setTxPending(0)}
                onRollback={() => setTxPending(0)}
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
