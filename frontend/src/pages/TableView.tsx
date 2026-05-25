import { useEffect, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Filter as FilterIcon,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataGrid } from "@/components/DataGrid"
import { FilterBar } from "@/components/FilterBar"
import { ColumnPicker } from "@/components/ColumnPicker"
import { VerticalRowPanel } from "@/components/VerticalRowPanel"
import { api } from "@/lib/api"
import { useShortcuts } from "@/lib/useShortcuts"
import type { Filter, ResultSet } from "@/lib/types"

const PAGE_SIZES = [300, 500, 1000]

interface TableViewProps {
  database: string
  table: string
  // True only when this is the visible tab, so its shortcuts don't fire from
  // the background (every table tab stays mounted).
  active: boolean
  totalRows: number
  dataVersion: number
  confirmDestructive: (sql: string, run: () => Promise<void>) => void
  onMutate: (label?: string) => void
}

export function TableView({
  database,
  table,
  active,
  totalRows,
  dataVersion,
  confirmDestructive,
  onMutate,
}: TableViewProps) {
  const [result, setResult] = useState<ResultSet | null>(null)
  const [rows, setRows] = useState<unknown[][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [filters, setFilters] = useState<Filter[]>([])
  const [appliedFilters, setAppliedFilters] = useState<Filter[]>([])
  const [showFilters, setShowFilters] = useState(false)

  const [visible, setVisible] = useState<Set<string>>(new Set())
  const [primaryKey, setPrimaryKey] = useState<string[]>([])
  // Columns MySQL assigns itself (auto_increment, generated) — omitted when
  // duplicating a row so they regenerate instead of colliding/erroring.
  const [autoCols, setAutoCols] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [addingRow, setAddingRow] = useState(false)
  const [newRow, setNewRow] = useState<unknown[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Staged duplicate rows awaiting Save — shown appended to the grid, tinted.
  const [pendingRows, setPendingRows] = useState<unknown[][]>([])
  const [savingPending, setSavingPending] = useState(false)

  const columns = result?.columns ?? []

  function reload() {
    setReloadKey((k) => k + 1)
  }

  function pkOf(row: unknown[]): Record<string, unknown> {
    const pk: Record<string, unknown> = {}
    for (const name of primaryKey) {
      const idx = columns.findIndex((c) => c.name === name)
      if (idx >= 0) pk[name] = row[idx]
    }
    return pk
  }

  // Reset per-table state when switching tables.
  useEffect(() => {
    setOffset(0)
    setFilters([])
    setAppliedFilters([])
    setVisible(new Set())
    setPrimaryKey([])
    setAutoCols(new Set())
    setPendingRows([])
    api
      .describeTable(database, table)
      .then((s) => {
        setPrimaryKey(s.primary_key ?? [])
        setAutoCols(
          new Set(
            (s.columns ?? [])
              .filter((c) => /auto_increment|generated/i.test(c.extra))
              .map((c) => c.name)
          )
        )
      })
      .catch(() => {
        setPrimaryKey([])
        setAutoCols(new Set())
      })
  }, [database, table])

  // Fetch rows whenever the query inputs change (or after a mutation).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .fetchRows({
        database,
        table,
        filters: appliedFilters,
        limit: pageSize,
        offset,
        order_by: "",
        order_dir: "",
      })
      .then((rs) => {
        if (cancelled) return
        setResult(rs)
        setRows(rs.rows ?? [])
        setSelected(new Set())
        setActiveRow(null)
        setPanelOpen(false)
        // A fresh page/filter/refresh replaces the row set, so any staged
        // duplicates no longer line up — discard them. (Staging & inline edits
        // never trigger a refetch, so this won't drop work mid-edit.)
        setPendingRows([])
        setVisible((prev) =>
          prev.size === 0 ? new Set(rs.columns.map((c) => c.name)) : prev
        )
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [database, table, offset, pageSize, appliedFilters, reloadKey, dataVersion])

  function toggleRow(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((_, i) => i))))
  }
  function openRow(i: number) {
    // Pending rows aren't in `rows`; edit them inline, not via the side panel.
    if (i >= rows.length) return
    setActiveRow(i)
    setAddingRow(false)
    setPanelOpen(true)
  }
  function toggleColumn(name: string) {
    setVisible((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function commitCell(rowIndex: number, colName: string, value: string) {
    // Pending (staged) rows are edited in local state, not the DB.
    if (rowIndex >= rows.length) {
      const k = rowIndex - rows.length
      const colIndex = columns.findIndex((c) => c.name === colName)
      setPendingRows((prev) =>
        prev.map((r, idx) => (idx === k ? r.map((v, j) => (j === colIndex ? value : v)) : r))
      )
      return
    }
    if (primaryKey.length === 0) {
      toast.error("No primary key — cannot update this table")
      return
    }
    api
      .updateRow(database, table, pkOf(rows[rowIndex]), { [colName]: value })
      .then(() => {
        const colIndex = columns.findIndex((c) => c.name === colName)
        setRows((prev) =>
          prev.map((r, i) => (i === rowIndex ? r.map((v, j) => (j === colIndex ? value : v)) : r))
        )
        onMutate(`UPDATE \`${table}\` — 1 row`)
        toast.success("Row updated")
      })
      .catch((e) => toast.error("Update failed", { description: String(e) }))
  }

  function savePanel(values: Record<string, string | null>) {
    if (addingRow) {
      // Omit PK fields left blank — MySQL will auto-assign them (auto_increment).
      const insertValues = Object.fromEntries(
        Object.entries(values).filter(([k, v]) => !(primaryKey.includes(k) && (v === "" || v === null)))
      )
      api
        .insertRow(database, table, insertValues)
        .then(() => {
          toast.success("Row inserted")
          setPanelOpen(false)
          onMutate(`INSERT INTO \`${table}\``)
          reload()
        })
        .catch((e) => toast.error("Insert failed", { description: String(e) }))
      return
    }
    if (activeRow === null) return
    if (primaryKey.length === 0) {
      toast.error("No primary key — cannot update this table")
      return
    }
    const setValues: Record<string, string> = {}
    for (const [k, v] of Object.entries(values)) {
      if (!primaryKey.includes(k)) setValues[k] = v
    }
    api
      .updateRow(database, table, pkOf(rows[activeRow]), setValues)
      .then(() => {
        toast.success("Row updated")
        setPanelOpen(false)
        onMutate(`UPDATE \`${table}\` — 1 row`)
        reload()
      })
      .catch((e) => toast.error("Update failed", { description: String(e) }))
  }

  function addRow() {
    setNewRow(columns.map(() => ""))
    setActiveRow(null)
    setAddingRow(true)
    setPanelOpen(true)
  }

  function handlePanelOpenChange(open: boolean) {
    setPanelOpen(open)
    if (!open) {
      setAddingRow(false)
      setNewRow(null)
    }
  }

  // Stage a copy of every selected row as a pending insert (shown tinted in the
  // grid). Auto_increment/generated columns are blanked so it's clear MySQL
  // fills them in. Nothing hits the DB until Save.
  function duplicateSelected() {
    if (selected.size === 0) return
    const indices = [...selected].filter((i) => i < rows.length)
    const copies = indices.map((i) =>
      columns.map((c, j) => (autoCols.has(c.name) ? null : rows[i][j]))
    )
    setPendingRows((prev) => [...prev, ...copies])
    setSelected(new Set())
  }

  // Commit all staged rows. Auto/generated columns are omitted so MySQL assigns
  // them. On error the staged rows are kept so the user can fix and retry.
  function savePending() {
    if (pendingRows.length === 0) return
    setSavingPending(true)
    const payloads = pendingRows.map((r) => {
      const values: Record<string, unknown> = {}
      columns.forEach((c, j) => {
        if (!autoCols.has(c.name)) values[c.name] = r[j]
      })
      return values
    })
    Promise.all(payloads.map((v) => api.insertRow(database, table, v)))
      .then(() => {
        toast.success(`${payloads.length} row(s) saved`)
        onMutate(`INSERT INTO \`${table}\` — ${payloads.length} row(s)`)
        setPendingRows([])
        reload()
      })
      .catch((e) => toast.error("Save failed", { description: String(e) }))
      .finally(() => setSavingPending(false))
  }

  function discardPending() {
    setPendingRows([])
  }

  function deleteSelected() {
    if (selected.size === 0) return
    if (primaryKey.length === 0) {
      toast.error("No primary key — cannot delete from this table")
      return
    }
    const indices = [...selected]
    const pkIndex = columns.findIndex((c) => c.name === primaryKey[0])
    const pks = indices.map((i) => pkOf(rows[i]))
    const preview = `DELETE FROM \`${table}\` WHERE \`${primaryKey[0]}\` IN (${indices
      .map((i) => rows[i][pkIndex])
      .join(", ")})`
    confirmDestructive(preview, () =>
      api.deleteRows(database, table, pks).then((n) => {
        toast.success(`${n} row(s) deleted`)
      })
    )
  }

  // Scoped to the visible tab (see `active`): ⌘R refresh, ⌘F filters, ⌘D
  // duplicate selection. ⌘S save / ⌘Z discard are bound only while rows are
  // staged, so they don't swallow those keys otherwise (⌘Z stays out of text
  // inputs so cell-edit undo still works).
  useShortcuts(
    [
      { key: "r", meta: true, handler: reload },
      { key: "f", meta: true, handler: () => setShowFilters((s) => !s) },
      { key: "d", meta: true, handler: duplicateSelected },
      ...(pendingRows.length > 0
        ? [
            { key: "s", meta: true, handler: savePending },
            { key: "z", meta: true, allowInInput: false, handler: discardPending },
          ]
        : []),
    ],
    active
  )

  const from = rows.length === 0 ? 0 : offset + 1
  const to = offset + rows.length
  const hasNext = rows.length === pageSize
  const panelRow = addingRow ? newRow : activeRow !== null ? (rows[activeRow] ?? null) : null

  // Real rows followed by staged duplicates; pending indices start at rows.length.
  const displayRows = pendingRows.length ? [...rows, ...pendingRows] : rows
  const pendingSet = pendingRows.length
    ? new Set(pendingRows.map((_, k) => rows.length + k))
    : undefined

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button
          variant={showFilters ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowFilters((s) => !s)}
          title="Toggle filters (⌘F)"
        >
          <FilterIcon className="size-3.5" /> Filter
          {appliedFilters.length > 0 && (
            <span className="bg-primary text-primary-foreground ml-0.5 rounded-full px-1.5 text-[10px]">
              {appliedFilters.length}
            </span>
          )}
        </Button>
        <ColumnPicker columns={columns} visible={visible} onToggle={toggleColumn} />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={addRow}>
          <Plus className="size-3.5" /> Add row
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={selected.size === 0}
          onClick={duplicateSelected}
          title="Duplicate selected rows — staged until you Save (⌘D)"
        >
          <Copy className="size-3.5" /> Duplicate
          {selected.size > 0 && ` (${selected.size})`}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={selected.size === 0}
          onClick={deleteSelected}
        >
          <Trash2 className="size-3.5" /> Delete
          {selected.size > 0 && ` (${selected.size})`}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
              <Download className="size-3.5" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => toast.success("Exported CSV (mock)")}>
              Export → CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.success("Exported SQL (mock)")}>
              Export → SQL
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setOffset((o) => Math.max(0, o - pageSize))}
            disabled={offset === 0 || loading}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-muted-foreground tabular-nums px-1 text-xs">
            {from.toLocaleString()}–{to.toLocaleString()} of {totalRows.toLocaleString()}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setOffset((o) => o + pageSize)}
            disabled={!hasNext || loading}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setOffset(0)
              setPageSize(Number(v))
            }}
          >
            <SelectTrigger size="sm" className="h-7 gap-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={reload}
            disabled={loading}
            title="Refresh (⌘R)"
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          </Button>
        </div>
      </div>

      {showFilters && (
        <FilterBar
          columns={columns}
          filters={filters}
          onChange={setFilters}
          onApply={() => {
            setOffset(0)
            setAppliedFilters(filters.filter((f) => f.enabled !== false))
          }}
        />
      )}

      {pendingRows.length > 0 && (
        <div className="flex items-center gap-2 border-b bg-emerald-500/10 px-3 py-1.5 text-xs">
          <span className="inline-block size-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-emerald-700 dark:text-emerald-400">
            {pendingRows.length} unsaved row{pendingRows.length !== 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground">— edit inline if needed, then save</span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={discardPending}
              disabled={savingPending}
              title="Discard staged rows (⌘Z)"
            >
              <X className="size-3.5" /> Discard
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
              onClick={savePending}
              disabled={savingPending}
              title="Save staged rows (⌘S)"
            >
              <Save className="size-3.5" />
              {savingPending ? "Saving…" : `Save ${pendingRows.length} row${pendingRows.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {error ? (
          <div className="text-destructive flex h-full items-center justify-center px-4 text-center text-xs">
            {error}
          </div>
        ) : loading && !result ? (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-xs">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : displayRows.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            No rows.
          </div>
        ) : (
          <DataGrid
            columns={columns}
            visible={visible}
            rows={displayRows}
            pending={pendingSet}
            selected={selected}
            activeRow={panelOpen && !addingRow ? activeRow : null}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            onRowClick={openRow}
            onCellCommit={commitCell}
          />
        )}
      </div>

      <VerticalRowPanel
        open={panelOpen}
        onOpenChange={handlePanelOpenChange}
        columns={columns}
        primaryKey={primaryKey}
        row={panelRow}
        isNew={addingRow}
        onSave={savePanel}
      />
    </div>
  )
}
