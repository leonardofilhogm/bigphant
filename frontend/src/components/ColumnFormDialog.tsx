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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ColumnDef, ColumnInfo } from "@/lib/types"

type DefaultMode = "none" | "literal" | "null" | "expr"

interface ColumnFormDialogProps {
  open: boolean
  mode: "add" | "edit"
  column?: ColumnInfo
  columnNames: string[]
  isPostgres?: boolean
  onClose: () => void
  onSubmit: (payload: {
    column: ColumnDef
    oldName?: string
    renamed: boolean
    position: string
  }) => void
}

function parseDefault(col?: ColumnInfo): { mode: DefaultMode; value: string } {
  if (!col?.default) return { mode: "none", value: "" }
  if (col.default.toUpperCase() === "NULL") return { mode: "null", value: "" }
  const exprs = ["CURRENT_TIMESTAMP", "NOW()", "UUID()"]
  if (exprs.some((e) => col.default?.toUpperCase().includes(e))) {
    return { mode: "expr", value: col.default }
  }
  return { mode: "literal", value: col.default.replace(/^'(.*)'$/, "$1") }
}

export function ColumnFormDialog({
  open,
  mode,
  column,
  columnNames,
  isPostgres = false,
  onClose,
  onSubmit,
}: ColumnFormDialogProps) {
  const [name, setName] = useState("")
  const [type, setType] = useState("VARCHAR(255)")
  const [nullable, setNullable] = useState(true)
  const [defaultMode, setDefaultMode] = useState<DefaultMode>("none")
  const [defaultValue, setDefaultValue] = useState("")
  const [autoIncrement, setAutoIncrement] = useState(false)
  const [comment, setComment] = useState("")
  const [position, setPosition] = useState("")
  const [afterCol, setAfterCol] = useState("")

  useEffect(() => {
    if (!open) return
    if (mode === "edit" && column) {
      setName(column.name)
      setType(column.type)
      setNullable(column.nullable)
      const d = parseDefault(column)
      setDefaultMode(d.mode)
      setDefaultValue(d.value)
      setAutoIncrement(column.extra.toLowerCase().includes("auto_increment"))
      setComment("")
      setPosition("")
      setAfterCol("")
    } else {
      setName("")
      setType("VARCHAR(255)")
      setNullable(true)
      setDefaultMode("none")
      setDefaultValue("")
      setAutoIncrement(false)
      setComment("")
      setPosition("")
      setAfterCol("")
    }
  }, [open, mode, column])

  function buildColumnDef(): ColumnDef {
    const col: ColumnDef = {
      name: name.trim(),
      type: type.trim(),
      nullable,
      has_default: defaultMode !== "none",
      default: defaultMode === "null" ? "NULL" : defaultValue.trim(),
      default_is_expr: defaultMode === "expr",
      auto_increment: autoIncrement && !isPostgres,
      comment: comment.trim(),
    }
    return col
  }

  function handleSubmit() {
    if (!name.trim() || !type.trim()) return
    let pos = ""
    if (!isPostgres && mode === "add") {
      if (position === "FIRST") pos = "FIRST"
      else if (position === "AFTER" && afterCol) pos = `AFTER ${afterCol}`
    }
    onSubmit({
      column: buildColumnDef(),
      oldName: column?.name,
      renamed: mode === "edit" && column != null && column.name !== name.trim(),
      position: pos,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add column" : "Edit column"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="col-name">Name</Label>
            <Input id="col-name" value={name} onChange={(e) => setName(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="col-type">Type</Label>
            <Input id="col-type" value={type} onChange={(e) => setType(e.target.value)} className="font-mono text-xs" placeholder="VARCHAR(255)" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={nullable} onCheckedChange={(v) => setNullable(v === true)} />
            Nullable
          </label>
          <div className="grid gap-1.5">
            <Label>Default</Label>
            <Select value={defaultMode} onValueChange={(v) => setDefaultMode(v as DefaultMode)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="literal">Literal</SelectItem>
                <SelectItem value="null">NULL</SelectItem>
                <SelectItem value="expr">Expression</SelectItem>
              </SelectContent>
            </Select>
            {(defaultMode === "literal" || defaultMode === "expr") && (
              <Input
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                className="font-mono text-xs"
                placeholder={defaultMode === "expr" ? "CURRENT_TIMESTAMP" : "default value"}
              />
            )}
          </div>
          {!isPostgres && (
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={autoIncrement} onCheckedChange={(v) => setAutoIncrement(v === true)} />
              Auto increment
            </label>
          )}
          {!isPostgres && (
            <div className="grid gap-1.5">
              <Label htmlFor="col-comment">Comment</Label>
              <Input id="col-comment" value={comment} onChange={(e) => setComment(e.target.value)} className="text-xs" />
            </div>
          )}
          {!isPostgres && mode === "add" && (
            <div className="grid gap-1.5">
              <Label>Position</Label>
              <Select value={position || "default"} onValueChange={(v) => setPosition(v === "default" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Default (last)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (last)</SelectItem>
                  <SelectItem value="FIRST">FIRST</SelectItem>
                  <SelectItem value="AFTER">AFTER column…</SelectItem>
                </SelectContent>
              </Select>
              {position === "AFTER" && (
                <Select value={afterCol} onValueChange={setAfterCol}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columnNames.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!name.trim() || !type.trim()}>
            Preview SQL
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
