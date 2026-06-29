import { Lock, LockOpen, MousePointer2, Table2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { EditMode } from "@/lib/types"
import { cn } from "@/lib/utils"

type ModeMeta = {
  id: EditMode
  Icon: typeof Table2
  label: string
  tagline: string
  description: string
}

// Kept in topbar order; icons match the topbar's lock metaphor so the chosen
// mode is recognisable from its single-icon button.
const MODES: ModeMeta[] = [
  {
    id: "inline",
    Icon: Table2,
    label: "Inline only",
    tagline: "Edit directly in the grid",
    description:
      "Single-click any cell to edit its value right where it sits. Fastest for quick, single-field tweaks.",
  },
  {
    id: "mixed",
    Icon: LockOpen,
    label: "Mixed",
    tagline: "Inline + side panel",
    description:
      "Single-click a cell to edit inline; double-click a row to open the full-record side panel. The default — best of both.",
  },
  {
    id: "side_panel",
    Icon: Lock,
    label: "Side panel",
    tagline: "Full-record form",
    description:
      "Single-click a row to open a side panel listing every column as a labeled field. Safer for wide rows.",
  },
]

const COLUMNS = ["id", "company", "status"] as const
const ROWS: readonly (readonly string[])[] = [
  ["1", "Acme Inc", "active"],
  ["2", "Globex", "pending"],
  ["3", "Initech", "active"],
]

// A small annotated mock of the data grid that illustrates how the selected
// mode reacts to a click. Static (no live data) — purely a visual aid.
function ModePreview({ mode }: { mode: EditMode }) {
  const editingCell = mode === "side_panel" ? null : { row: 0, col: 1 }
  const activeRow = mode === "side_panel" ? 1 : mode === "mixed" ? 0 : null
  const showPanel = mode !== "inline"
  const panelRow = mode === "side_panel" ? 1 : 0

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-1 gap-2 overflow-hidden">
        {/* Mock grid */}
        <div className="flex-1 overflow-hidden rounded-md border bg-background">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground">
                {COLUMNS.map((c) => (
                  <th key={c} className="border-b px-2 py-1 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, r) => {
                const rowActive = activeRow === r
                return (
                  <tr
                    key={r}
                    className={cn(
                      "transition-colors",
                      rowActive && "bg-primary/10"
                    )}
                  >
                    {row.map((cell, c) => {
                      const isEditing = editingCell?.row === r && editingCell?.col === c
                      return (
                        <td
                          key={c}
                          className={cn(
                            "relative border-b px-2 py-1",
                            isEditing && "p-0.5"
                          )}
                        >
                          {isEditing ? (
                            <span className="ring-primary bg-background flex items-center rounded-sm px-1.5 py-0.5 ring-2">
                              {cell}
                              <span className="bg-primary ml-0.5 inline-block h-3 w-px animate-pulse" />
                            </span>
                          ) : (
                            cell
                          )}
                          {/* Annotated cursor on the click target */}
                          {(isEditing ||
                            (rowActive && mode === "side_panel" && c === 0)) && (
                            <span className="pointer-events-none absolute -right-1 -bottom-2 flex items-center gap-0.5">
                              <MousePointer2 className="fill-foreground text-background size-3.5 drop-shadow" />
                              {mode === "mixed" && (
                                <span className="bg-foreground text-background rounded px-1 text-[8px] font-semibold leading-tight">
                                  ×2
                                </span>
                              )}
                            </span>
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

        {/* Side panel */}
        {showPanel && (
          <div
            className={cn(
              "bg-muted/40 w-32 shrink-0 rounded-md border p-2",
              mode === "mixed" && "opacity-70"
            )}
          >
            <p className="text-muted-foreground mb-1.5 text-[9px] font-medium tracking-wide uppercase">
              Record
            </p>
            <div className="space-y-1.5">
              {COLUMNS.map((c, i) => (
                <div key={c}>
                  <p className="text-muted-foreground text-[8px] uppercase">{c}</p>
                  <div className="bg-background mt-0.5 rounded border px-1.5 py-0.5 text-[10px]">
                    {ROWS[panelRow][i]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Caption */}
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <MousePointer2 className="mt-0.5 size-3 shrink-0" />
        <span>
          {mode === "inline" &&
            "Single-click a cell to edit it directly in the grid."}
          {mode === "mixed" && (
            <>
              <strong className="text-foreground font-medium">Single-click</strong> a
              cell to edit inline ·{" "}
              <strong className="text-foreground font-medium">double-click</strong> a
              row to open the side panel.
            </>
          )}
          {mode === "side_panel" &&
            "Single-click a row to open the full-record side panel."}
        </span>
      </p>
    </div>
  )
}

export function EditModeDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: EditMode
  onChange: (mode: EditMode) => void
}) {
  // Local selection so the user can preview modes before committing.
  const [selected, setSelected] = useState<EditMode>(value)

  // Re-sync whenever the dialog (re)opens — the live value is authoritative.
  useEffect(() => {
    if (open) setSelected(value)
  }, [open, value])

  function apply() {
    if (selected !== value) onChange(selected)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Row editing method</DialogTitle>
          <DialogDescription>
            Choose how clicking a cell or row edits data in this connection's grids.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Options */}
          <div className="flex flex-col gap-2">
            {MODES.map((m) => {
              const active = selected === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex gap-3 rounded-lg border p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5 ring-primary/40 ring-1"
                      : "hover:bg-muted/50"
                  )}
                >
                  <m.Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.label}</span>
                      {m.id === "mixed" && (
                        <span className="bg-muted text-muted-foreground rounded px-1 text-[9px] font-medium uppercase">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs leading-snug">
                      {m.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Live preview of the selected mode */}
          <div className="bg-muted/20 rounded-lg border p-3">
            <ModePreview mode={selected} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Use this mode</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
