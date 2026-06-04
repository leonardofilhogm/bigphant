import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { IndexDef } from "@/lib/types"

interface IndexFormDialogProps {
  open: boolean
  columnNames: string[]
  onClose: () => void
  onSubmit: (index: IndexDef) => void
}

export function IndexFormDialog({ open, columnNames, onClose, onSubmit }: IndexFormDialogProps) {
  const [name, setName] = useState("")
  const [unique, setUnique] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setName("")
    setUnique(false)
    setSelected([])
  }, [open])

  function toggle(col: string) {
    setSelected((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add index</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="idx-name">Name (optional)</Label>
            <Input id="idx-name" value={name} onChange={(e) => setName(e.target.value)} className="font-mono text-xs" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={unique} onCheckedChange={(v) => setUnique(v === true)} />
            Unique
          </label>
          <div className="grid gap-1">
            <Label>Columns</Label>
            <div className="max-h-40 overflow-auto rounded border p-2">
              {columnNames.map((col) => (
                <label key={col} className="flex items-center gap-2 py-0.5 text-xs">
                  <Checkbox checked={selected.includes(col)} onCheckedChange={() => toggle(col)} />
                  <span className="font-mono">{col}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={selected.length === 0}
            onClick={() => onSubmit({ name: name.trim(), columns: selected, unique })}
          >
            Preview SQL
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
