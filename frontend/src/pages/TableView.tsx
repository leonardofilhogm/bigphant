import { useEffect, useMemo, useRef, useState } from "react"
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
import { SubTabs } from "@/components/SubTabs"
import { VerticalRowPanel } from "@/components/VerticalRowPanel"
import { api } from "@/lib/api"
import { isPlanRequired, parseAppError } from "@/lib/errors"
import { useShortcuts } from "@/lib/useShortcuts"
import { useMenuEvents } from "@/lib/useMenuEvents"
import type { Column, EditMode, Filter, ResultSet } from "@/lib/types"

const PAGE_SIZES = [300, 500, 1000]

type SortDir = "ASC" | "DESC"

function serializeRowPk(row: unknown[], columns: Column[], primaryKey: string[]): string {
  const pk: Record<string, unknown> = {}
  for (const name of primaryKey) {
    const idx = columns.findIndex((c) => c.name === name)
    if (idx >= 0) pk[name] = row[idx]
  }
  return JSON.stringify(pk)
}

function defaultSortColumn(cols: Column[], pk: string[]): string | null {
  const id = cols.find((c) => c.name.toLowerCase() === "id")
  if (id) return id.name
  if (pk.length > 0) return pk[0]
  return null
}

interface TableViewProps {
  database: string
  table: string
  active: boolean
  totalRows: number
  dataVersion: number
  confirmDestructive: (sql: string, run: () => Promise<void>) => void
  onMutate: (label?: string) => void
  isExplicit: boolean
  txVersion: number
  /** Views are browse-only even when the connection is writable. */
  readOnly?: boolean
  /** Row-editing method, persisted per connection. */
  editMode?: EditMode
  canExport?: boolean
  onPlanRequired?: (message: string) => void
  /** Current sub-tab and switcher, rendered in the bottom bar (table tabs). */
  sub?: string
  subOptions?: readonly string[]
  onSubChange?: (sub: string) => void
}

export function TableView({
  database,
  table,
  active,
  totalRows,
  dataVersion,
  confirmDestructive,
  onMutate,
  isExplicit,
  txVersion,
  readOnly = false,
  editMode = "mixed",
  canExport = false,
  onPlanRequired,
  sub,
  subOptions,
  onSubChange,
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
  const [sort, setSort] = useState<{ column: string; dir: SortDir } | null>(null)
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
  // Explicit-transaction dirty tracking. dirtyUpdatedCells maps serialized PK →
  // Set of column names that were modified but not yet committed.
  const [dirtyUpdatedCells, setDirtyUpdatedCells] = useState(() => new Map<string, Set<string>>())
  // Last-insert IDs from rows inserted in this uncommitted transaction. Using
  // the numeric ID returned by insertRow avoids snapshot/closure race issues.
  const [dirtyInsertedIds, setDirtyInsertedIds] = useState<number[]>([])
  // Row index to scroll into view after an insert reload completes.
  const [scrollToRow, setScrollToRow] = useState<number | null>(null)
  // Set to true after an insert so the post-load effect scrolls to the new row.
  const pendingScrollRef = useRef(false)

  const columns = result?.columns ?? []

  function reload() {
    setReloadKey((k) => k + 1)
  }

  // Toggle the filter panel; when opening with no filters yet, seed one empty
  // row so the user lands on an editable line instead of a "No filters." prompt.
  function toggleFilters() {
    const opening = !showFilters
    if (opening && filters.length === 0 && columns.length > 0) {
      setFilters([{ column: columns[0].name, comparator: "=", value: "", enabled: true }])
    }
    setShowFilters(opening)
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
    setSort(null)
    setAutoCols(new Set())
    setPendingRows([])
    setDirtyUpdatedCells(new Map())
    setDirtyInsertedIds([])
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

  // Clear dirty highlights on commit/rollback.
  useEffect(() => {
    setDirtyUpdatedCells((prev) => (prev.size > 0 ? new Map() : prev))
    setDirtyInsertedIds((prev) => (prev.length > 0 ? [] : prev))
  }, [txVersion])

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
        order_by: sort?.column ?? "",
        order_dir: sort?.dir ?? "",
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

        if (sort == null) {
          const col = defaultSortColumn(rs.columns ?? [], primaryKey)
          if (col) setSort({ column: col, dir: "ASC" })
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [database, table, offset, pageSize, appliedFilters, reloadKey, dataVersion, sort, primaryKey])

  function onSort(colName: string) {
    setOffset(0)
    setSort((prev) =>
      prev?.column === colName
        ? { column: colName, dir: prev.dir === "ASC" ? "DESC" : "ASC" }
        : { column: colName, dir: "ASC" }
    )
  }

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
  function setAllColumns(show: boolean) {
    setVisible(show ? new Set(columns.map((c) => c.name)) : new Set())
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
    const colIndex = columns.findIndex((c) => c.name === colName)
    const pkSer = isExplicit ? serializeRowPk(rows[rowIndex], columns, primaryKey) : null

    // Optimistic: show new value immediately; reload reverts on failure.
    setRows((prev) =>
      prev.map((r, i) => (i === rowIndex ? r.map((v, j) => (j === colIndex ? value : v)) : r))
    )

    api
      .updateRow(database, table, pkOf(rows[rowIndex]), { [colName]: value })
      .then(() => {
        onMutate(`UPDATE \`${table}\` — 1 row`)
        toast.success("Row updated")
        if (pkSer) {
          setDirtyUpdatedCells((prev) => {
            const next = new Map(prev)
            const cols = new Set(next.get(pkSer) ?? [])
            cols.add(colName)
            next.set(pkSer, cols)
            return next
          })
        }
      })
      .catch((e) => {
        toast.error("Update failed", { description: String(e) })
        reload()
      })
  }

  function savePanel(values: Record<string, string | null>) {
    if (addingRow) {
      // Omit blank/null fields entirely — lets MySQL apply column defaults (e.g.
      // NULL for nullable timestamps like deleted_at). Non-empty values pass through.
      const insertValues = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== "" && v !== null)
      )
      api
        .insertRow(database, table, insertValues)
        .then((insertedId) => {
          toast.success("Row inserted")
          setPanelOpen(false)
          onMutate(`INSERT INTO \`${table}\``)
          if (isExplicit && insertedId > 0) {
            setDirtyInsertedIds((prev) => [...prev, insertedId])
            pendingScrollRef.current = true
          }
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
    const pkSer = isExplicit ? serializeRowPk(rows[activeRow], columns, primaryKey) : null
    const setValues: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(values)) {
      if (!primaryKey.includes(k)) setValues[k] = v
    }
    api
      .updateRow(database, table, pkOf(rows[activeRow]), setValues)
      .then(() => {
        toast.success("Row updated")
        setPanelOpen(false)
        onMutate(`UPDATE \`${table}\` — 1 row`)
        if (pkSer) {
          const changedCols = Object.keys(setValues)
          setDirtyUpdatedCells((prev) => {
            const next = new Map(prev)
            const cols = new Set([...(next.get(pkSer) ?? []), ...changedCols])
            next.set(pkSer, cols)
            return next
          })
        }
        reload()
      })
      .catch((e) => toast.error("Update failed", { description: String(e) }))
  }

  function addRow() {
    // In inline mode, stage a blank row directly in the grid (edit it in place)
    // instead of opening the side panel. Auto/generated columns start NULL so
    // it's clear the DB fills them in. Nothing hits the DB until Save.
    if (editMode === "inline") {
      setPendingRows((prev) => {
        const next = [...prev, columns.map((c) => (autoCols.has(c.name) ? null : ""))]
        setScrollToRow(rows.length + next.length - 1)
        return next
      })
      return
    }
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
        // Skip auto/generated columns, and omit blank/null fields so the DB
        // applies column defaults (e.g. an empty inline-added row inserts using
        // defaults instead of forcing "" into date/int/NOT NULL columns). This
        // mirrors the side-panel insert path (savePanel).
        if (autoCols.has(c.name)) return
        if (r[j] === "" || r[j] === null) return
        values[c.name] = r[j]
      })
      return values
    })
    // Insert sequentially, not Promise.all: in explicit-commit mode every
    // insert runs inside the one open transaction (a single DB connection),
    // and the driver can't execute statements on it concurrently — parallel
    // inserts surface as "driver: bad connection".
    ;(async () => {
      const insertedIds: number[] = []
      for (const v of payloads) {
        insertedIds.push(await api.insertRow(database, table, v))
      }
      return insertedIds
    })()
      .then((insertedIds) => {
        toast.success(`${payloads.length} row(s) saved`)
        onMutate(`INSERT INTO \`${table}\` — ${payloads.length} row(s)`)
        if (isExplicit) {
          const validIds = insertedIds.filter((id) => id > 0)
          if (validIds.length > 0) {
            setDirtyInsertedIds((prev) => [...prev, ...validIds])
            pendingScrollRef.current = true
          }
        }
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

  // ⌘R refresh and ⌘F filters now come from the native View menu (see menu.go);
  // handled below via useMenuEvents, scoped to the visible tab. ⌘D duplicate and
  // ⌘S save / ⌘Z discard stay as JS shortcuts — they're context-sensitive (only
  // while rows are staged; ⌘Z stays out of text inputs so cell-edit undo works).
  useShortcuts(
    readOnly
      ? []
      : [
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

  // Native View-menu actions, scoped to the visible tab.
  useMenuEvents(
    {
      "menu:refresh": reload,
      "menu:toggle-filters": toggleFilters,
    },
    active
  )

  // Map PK → dirty columns → row index → dirty column set, for cell-level highlighting.
  const dirtyUpdatedCellMap = useMemo(() => {
    if (primaryKey.length === 0 || dirtyUpdatedCells.size === 0) return new Map<number, Set<string>>()
    const m = new Map<number, Set<string>>()
    rows.forEach((row, i) => {
      const cols = dirtyUpdatedCells.get(serializeRowPk(row, columns, primaryKey))
      if (cols) m.set(i, cols)
    })
    return m
  }, [rows, columns, dirtyUpdatedCells, primaryKey])

  const dirtyInsertedIndices = useMemo(() => {
    if (dirtyInsertedIds.length === 0 || primaryKey.length === 0) return new Set<number>()
    const pkColIdx = columns.findIndex((c) => c.name === primaryKey[0])
    if (pkColIdx < 0) return new Set<number>()
    const idStrs = new Set(dirtyInsertedIds.map(String))
    const s = new Set<number>()
    rows.forEach((row, i) => {
      if (idStrs.has(String(row[pkColIdx]))) s.add(i)
    })
    return s
  }, [rows, columns, dirtyInsertedIds, primaryKey])

  // After an insert reload, scroll to the first newly inserted row.
  useEffect(() => {
    if (!loading && pendingScrollRef.current && dirtyInsertedIndices.size > 0) {
      setScrollToRow(Math.min(...dirtyInsertedIndices))
      pendingScrollRef.current = false
    }
  }, [loading, dirtyInsertedIndices])

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
      {showFilters && (
        <FilterBar
          columns={columns}
          filters={filters}
          onChange={(next) => {
            setFilters(next)
            if (next.length === 0) {
              setOffset(0)
              setAppliedFilters([])
            }
          }}
          onApply={() => {
            setOffset(0)
            setAppliedFilters(filters.filter((f) => f.enabled !== false))
          }}
        />
      )}

      {pendingRows.length > 0 && !readOnly && (
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
            dirtyUpdated={dirtyUpdatedCellMap}
            dirtyInserted={dirtyInsertedIndices}
            scrollToRow={scrollToRow}
            sort={sort}
            onSort={onSort}
            selected={selected}
            activeRow={panelOpen && !addingRow ? activeRow : null}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            onRowClick={openRow}
            onCellCommit={readOnly ? () => {} : commitCell}
            readOnly={readOnly}
            editMode={editMode}
            tableName={table}
          />
        )}
      </div>

      {/* Bottom bar — sub-tab switch + row/table actions on the left,
          paging/refresh on the right (TablePlus/Beekeeper layout). */}
      <div className="bg-muted/20 flex items-center gap-1 border-t px-2 py-1">
        {onSubChange && subOptions && (
          <>
            <SubTabs value={sub ?? subOptions[0]} options={subOptions} onChange={onSubChange} />
            <Separator orientation="vertical" className="mx-1 h-5" />
          </>
        )}
        <Button
          variant={showFilters ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={toggleFilters}
          title="Toggle filters (⌘F)"
        >
          <FilterIcon className="size-3.5" /> Filter
          {appliedFilters.length > 0 && (
            <span className="bg-primary text-primary-foreground ml-0.5 rounded-full px-1.5 text-[10px]">
              {appliedFilters.length}
            </span>
          )}
        </Button>
        {!readOnly && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={addRow}>
            <Plus className="size-3.5" /> Add row
          </Button>
        )}
        <ColumnPicker columns={columns} visible={visible} onToggle={toggleColumn} onSetAll={setAllColumns} />
        {!readOnly && (
          <>
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
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
              <Download className="size-3.5" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={async () => {
                if (!canExport) {
                  onPlanRequired?.("Upgrade to Pro to export data")
                  return
                }
                try {
                  await api.exportRows(database, table, "csv")
                  toast.success("Exported CSV")
                } catch (e) {
                  const { message } = parseAppError(e)
                  if (isPlanRequired(e)) onPlanRequired?.(message)
                  else toast.error(message)
                }
              }}
            >
              Export → CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                if (!canExport) {
                  onPlanRequired?.("Upgrade to Pro to export data")
                  return
                }
                try {
                  await api.exportRows(database, table, "sql")
                  toast.success("Exported SQL")
                } catch (e) {
                  const { message } = parseAppError(e)
                  if (isPlanRequired(e)) onPlanRequired?.(message)
                  else toast.error(message)
                }
              }}
            >
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

      {!readOnly && (
        <VerticalRowPanel
          open={panelOpen}
          onOpenChange={handlePanelOpenChange}
          columns={columns}
          primaryKey={primaryKey}
          row={panelRow}
          isNew={addingRow}
          onSave={savePanel}
          dirtyColumns={!addingRow && activeRow !== null ? dirtyUpdatedCellMap.get(activeRow) : undefined}
        />
      )}
    </div>
  )
}
