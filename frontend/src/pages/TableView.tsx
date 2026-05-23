import { useEffect, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter as FilterIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
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
import { DataGrid } from "@/components/DataGrid"
import { FilterBar } from "@/components/FilterBar"
import { ColumnPicker } from "@/components/ColumnPicker"
import { VerticalRowPanel } from "@/components/VerticalRowPanel"
import { api } from "@/lib/api"
import type { Filter, ResultSet } from "@/lib/types"

const LIMIT = 300

interface TableViewProps {
  database: string
  table: string
  dataVersion: number
  confirmDestructive: (sql: string, run: () => Promise<void>) => void
  onMutate: () => void
}

export function TableView({
  database,
  table,
  dataVersion,
  confirmDestructive,
  onMutate,
}: TableViewProps) {
  const [result, setResult] = useState<ResultSet | null>(null)
  const [rows, setRows] = useState<unknown[][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState<Filter[]>([])
  const [appliedFilters, setAppliedFilters] = useState<Filter[]>([])
  const [showFilters, setShowFilters] = useState(false)

  const [visible, setVisible] = useState<Set<string>>(new Set())
  const [primaryKey, setPrimaryKey] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [addingRow, setAddingRow] = useState(false)
  const [newRow, setNewRow] = useState<unknown[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

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
    api
      .describeTable(database, table)
      .then((s) => setPrimaryKey(s.primary_key ?? []))
      .catch(() => setPrimaryKey([]))
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
        limit: LIMIT,
        offset,
        order_by: "",
        order_dir: "",
      })
      .then((rs) => {
        if (cancelled) return
        setResult(rs)
        setRows(rs.rows)
        setSelected(new Set())
        setActiveRow(null)
        setPanelOpen(false)
        setVisible((prev) =>
          prev.size === 0 ? new Set(rs.columns.map((c) => c.name)) : prev
        )
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [database, table, offset, appliedFilters, reloadKey, dataVersion])

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
        onMutate()
        toast.success("Row updated")
      })
      .catch((e) => toast.error("Update failed", { description: String(e) }))
  }

  function savePanel(values: Record<string, string | null>) {
    if (addingRow) {
      api
        .insertRow(database, table, values)
        .then(() => {
          toast.success("Row inserted")
          setPanelOpen(false)
          onMutate()
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
        onMutate()
        reload()
      })
      .catch((e) => toast.error("Update failed", { description: String(e) }))
  }

  function addRow() {
    setNewRow(columns.map(() => null))
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

  const from = rows.length === 0 ? 0 : offset + 1
  const to = offset + rows.length
  const hasNext = rows.length === LIMIT
  const panelRow = addingRow ? newRow : activeRow !== null ? (rows[activeRow] ?? null) : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button
          variant={showFilters ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowFilters((s) => !s)}
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
            onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
            disabled={offset === 0 || loading}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-muted-foreground tabular-nums px-1 text-xs">
            {from}–{to}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setOffset((o) => o + LIMIT)}
            disabled={!hasNext || loading}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={reload}
            disabled={loading}
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
            setAppliedFilters(filters)
          }}
        />
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
        ) : rows.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            No rows.
          </div>
        ) : (
          <DataGrid
            columns={columns}
            visible={visible}
            rows={rows}
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
