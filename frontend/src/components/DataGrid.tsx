import { useState } from "react"
import { Braces } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { Column } from "@/lib/types"

interface DataGridProps {
  columns: Column[]
  visible: Set<string>
  rows: unknown[][]
  selected: Set<number>
  activeRow: number | null
  onToggleRow: (index: number) => void
  onToggleAll: () => void
  onRowClick: (index: number) => void
  onCellCommit: (rowIndex: number, colName: string, value: string) => void
}

export function DataGrid({
  columns,
  visible,
  rows,
  selected,
  activeRow,
  onToggleRow,
  onToggleAll,
  onRowClick,
  onCellCommit,
}: DataGridProps) {
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null)
  const [draft, setDraft] = useState("")

  const shown = columns
    .map((c, i) => ({ col: c, index: i }))
    .filter(({ col }) => visible.has(col.name))

  const allSelected = rows.length > 0 && selected.size === rows.length

  function commit() {
    if (!editing) return
    onCellCommit(editing.row, columns[editing.col].name, draft)
    setEditing(null)
  }

  return (
    <div className="relative h-full overflow-auto">
      <table className="border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="bg-muted text-muted-foreground sticky left-0 z-20 w-9 border-b border-r px-2 py-1.5">
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all" />
            </th>
            {shown.map(({ col }) => (
              <th
                key={col.name}
                className="bg-muted text-muted-foreground border-b border-r px-3 py-1.5 text-left font-medium whitespace-nowrap"
              >
                <span className="text-foreground">{col.name}</span>
                <span className="ml-1.5 font-normal opacity-60">{col.type}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const isActive = activeRow === rowIndex
            const isSelected = selected.has(rowIndex)
            return (
              <tr
                key={rowIndex}
                onClick={() => onRowClick(rowIndex)}
                className={cn(
                  "cursor-default",
                  isActive
                    ? "bg-primary/10"
                    : isSelected
                      ? "bg-accent"
                      : "hover:bg-muted/50"
                )}
              >
                <td
                  className="bg-background sticky left-0 z-10 border-b border-r px-2 py-1 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleRow(rowIndex)}
                    aria-label={`Select row ${rowIndex + 1}`}
                  />
                </td>
                {shown.map(({ col, index }) => {
                  const value = row[index]
                  const isEditing = editing?.row === rowIndex && editing?.col === index
                  return (
                    <td
                      key={col.name}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setEditing({ row: rowIndex, col: index })
                        setDraft(value == null ? "" : String(value))
                      }}
                      className="max-w-[340px] truncate border-b border-r px-3 py-1 font-mono whitespace-nowrap"
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
                          className="ring-primary -mx-1 w-[calc(100%+0.5rem)] rounded-sm bg-transparent px-1 outline-none ring-2"
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
