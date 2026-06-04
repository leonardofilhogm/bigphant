import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Braces, ChevronsUpDown } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { Column, EditMode } from "@/lib/types"

// In "mixed" mode a single click edits inline while a double click opens the
// side panel; we wait this long after the first click to see if a second one
// arrives before committing to inline edit.
const MIXED_CLICK_DELAY_MS = 180

interface DataGridProps {
  columns: Column[]
  visible: Set<string>
  rows: unknown[][]
  sort?: { column: string; dir: "ASC" | "DESC" } | null
  onSort?: (colName: string) => void
  selected: Set<number>
  activeRow: number | null
  // Row indices that are staged (unsaved) inserts — rendered tinted, marked
  // with a dot instead of a select checkbox.
  pending?: Set<number>
  readOnly?: boolean
  // Inserted rows with uncommitted changes — whole-row blue highlight.
  dirtyInserted?: Set<number>
  // Map of row index → Set of column names modified but not yet committed.
  dirtyUpdated?: Map<number, Set<string>>
  scrollToRow?: number | null
  // Row-editing method (persisted per connection). Decides whether a click
  // edits inline, opens the side panel, or both. See EditMode in lib/types.
  editMode: EditMode
  onToggleRow: (index: number) => void
  onToggleAll: () => void
  /** Opens the side panel for a row (used by mixed/side_panel modes). */
  onRowClick: (index: number) => void
  onCellCommit: (rowIndex: number, colName: string, value: string) => void
}

export function DataGrid({
  columns,
  visible,
  rows,
  sort,
  onSort,
  selected,
  activeRow,
  pending,
  dirtyInserted,
  dirtyUpdated,
  scrollToRow,
  readOnly = false,
  editMode,
  onToggleRow,
  onToggleAll,
  onRowClick,
  onCellCommit,
}: DataGridProps) {
  const [editing, setEditing] = useState<{ row: number; col: number; orig: string } | null>(null)
  const [draft, setDraft] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  // Pending single-click timer for "mixed" mode (cleared by a double click).
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (scrollToRow == null || !containerRef.current) return
    const tr = containerRef.current.querySelector(`tr[data-row="${scrollToRow}"]`)
    tr?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [scrollToRow])

  // Cancel any in-flight click timer on unmount.
  useEffect(() => () => clearPendingClick(), [])

  function clearPendingClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
  }

  function startEdit(rowIndex: number, colIndex: number, value: unknown) {
    const initial = value == null ? "" : String(value)
    setEditing({ row: rowIndex, col: colIndex, orig: initial })
    setDraft(initial)
  }

  // Routes a cell click to inline edit and/or the side panel based on editMode.
  function handleCellClick(rowIndex: number, colIndex: number, value: unknown) {
    // Clicking inside the already-open editor must not reset the draft.
    if (editing?.row === rowIndex && editing?.col === colIndex) return

    // Staged (unsaved) rows aren't in the side-panel row set — always inline.
    if (pending?.has(rowIndex)) {
      if (!readOnly) startEdit(rowIndex, colIndex, value)
      return
    }

    if (editMode === "side_panel") {
      onRowClick(rowIndex)
      return
    }
    if (readOnly) return
    if (editMode === "inline") {
      startEdit(rowIndex, colIndex, value)
      return
    }
    // mixed: defer inline edit briefly; a double click cancels it and opens
    // the side panel instead.
    clearPendingClick()
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      startEdit(rowIndex, colIndex, value)
    }, MIXED_CLICK_DELAY_MS)
  }

  function handleRowDoubleClick(rowIndex: number) {
    if (editMode !== "mixed") return
    if (pending?.has(rowIndex)) return
    clearPendingClick()
    setEditing(null)
    onRowClick(rowIndex)
  }

  const shown = columns
    .map((c, i) => ({ col: c, index: i }))
    .filter(({ col }) => visible.has(col.name))

  // Only real (non-pending) rows are selectable.
  const selectableCount = rows.length - (pending?.size ?? 0)
  const allSelected = selectableCount > 0 && selected.size === selectableCount

  function commit() {
    if (!editing) return
    // Only stage a change if the value actually differs — clicking a cell and
    // blurring without typing must not mark it dirty.
    if (draft !== editing.orig) {
      onCellCommit(editing.row, columns[editing.col].name, draft)
    }
    setEditing(null)
  }

  return (
    <div ref={containerRef} className="relative h-full overflow-auto">
      <table className="border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="bg-muted text-muted-foreground sticky left-0 z-20 w-9 border-b border-r px-2 py-1.5">
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all" />
            </th>
            {shown.map(({ col }) => (
              <th
                key={col.name}
                onClick={() => onSort?.(col.name)}
                className={cn(
                  "bg-muted text-muted-foreground border-b border-r px-3 py-1.5 text-left font-medium whitespace-nowrap",
                  onSort && "cursor-pointer select-none hover:bg-muted/80 group"
                )}
                aria-sort={
                  sort?.column === col.name
                    ? sort.dir === "ASC"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <span className="inline-flex items-center gap-1">
                  <span className="text-foreground">{col.name}</span>
                  <span className="font-normal opacity-60">{col.type}</span>
                  {sort?.column === col.name ? (
                    sort.dir === "ASC" ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    )
                  ) : (
                    <ChevronsUpDown className="size-3 opacity-0 group-hover:opacity-40" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const isActive = activeRow === rowIndex
            const isSelected = selected.has(rowIndex)
            const isPending = pending?.has(rowIndex) ?? false
            const isDirtyInserted = dirtyInserted?.has(rowIndex) ?? false
            const dirtyCols = dirtyUpdated?.get(rowIndex)
            return (
              <tr
                key={rowIndex}
                data-row={rowIndex}
                onDoubleClick={() => handleRowDoubleClick(rowIndex)}
                className={cn(
                  "cursor-default",
                  isPending
                    ? "bg-emerald-500/10 hover:bg-emerald-500/20"
                    : isDirtyInserted
                      ? "bg-blue-500/20 hover:bg-blue-500/30"
                      : isActive
                        ? "bg-primary/10"
                        : isSelected
                          ? "bg-accent"
                          : rowIndex % 2 === 1
                            ? "bg-muted/40 hover:bg-muted/60"
                            : "hover:bg-muted/50"
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 border-b border-r px-2 py-1 text-center",
                    isPending
                      ? "bg-emerald-50 dark:bg-emerald-950/60"
                      : isDirtyInserted
                        ? "bg-blue-100 dark:bg-blue-950/80 border-l-2 border-l-blue-500"
                        : rowIndex % 2 === 1
                          ? "bg-muted"
                          : "bg-background"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {isPending ? (
                    <span
                      className="inline-block size-2 rounded-full bg-emerald-500"
                      title="Unsaved new row"
                    />
                  ) : (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleRow(rowIndex)}
                      aria-label={`Select row ${rowIndex + 1}`}
                    />
                  )}
                </td>
                {shown.map(({ col, index }) => {
                  const value = row[index]
                  const isEditing = editing?.row === rowIndex && editing?.col === index
                  const isDirtyCell = dirtyCols?.has(col.name) ?? false
                  return (
                    <td
                      key={col.name}
                      onClick={() => handleCellClick(rowIndex, index, value)}
                      className={cn(
                        "max-w-[340px] truncate border-b border-r px-3 py-1 font-mono whitespace-nowrap",
                        isDirtyCell && "bg-amber-500/15 italic",
                        isEditing && "ring-primary bg-background ring-2 ring-inset"
                      )}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault()
                              commit()
                            } else if (e.key === "Escape") {
                              setEditing(null)
                            }
                          }}
                          className="-mx-3 -my-1 w-[calc(100%+1.5rem)] bg-transparent px-3 py-1 outline-none"
                        />
                      ) : (
                        <CellValue value={value} />
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/60 italic">NULL</span>
  }
  if (typeof value === "object") {
    return (
      <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]">
        <Braces className="size-3" />
        {Array.isArray(value) ? `[${value.length}]` : "{…}"}
      </span>
    )
  }
  return <>{String(value)}</>
}
