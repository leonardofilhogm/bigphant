import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Column, Comparator, Filter } from "@/lib/types"

const comparators: Comparator[] = [
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "LIKE",
  "IS NULL",
  "IS NOT NULL",
]

const valueless = (c: Comparator) => c === "IS NULL" || c === "IS NOT NULL"

interface FilterBarProps {
  columns: Column[]
  filters: Filter[]
  onChange: (filters: Filter[]) => void
  onApply: () => void
}

export function FilterBar({ columns, filters, onChange, onApply }: FilterBarProps) {
  function update(i: number, patch: Partial<Filter>) {
    onChange(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }
  function add() {
    onChange([...filters, { column: columns[0]?.name ?? "", comparator: "=", value: "" }])
  }
  function remove(i: number) {
    onChange(filters.filter((_, idx) => idx !== i))
  }

  return (
    <div className="bg-muted/30 flex flex-wrap items-center gap-2 border-b px-3 py-2">
      {filters.length === 0 && (
        <span className="text-muted-foreground text-xs">No filters.</span>
      )}

      {filters.map((f, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground px-1 text-[10px] font-medium">AND</span>}
          <Select value={f.column} onValueChange={(v) => update(i, { column: v })}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {columns.map((c) => (
                <SelectItem key={c.name} value={c.name} className="text-xs">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={f.comparator} onValueChange={(v) => update(i, { comparator: v as Comparator })}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {comparators.map((c) => (
                <SelectItem key={c} value={c} className="font-mono text-xs">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={f.value}
            disabled={valueless(f.comparator)}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="value"
            className="h-7 w-32 text-xs"
          />
          <Button variant="ghost" size="icon" className="size-7" onClick={() => remove(i)}>
            <X className="size-3.5" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={add}>
        <Plus className="size-3.5" /> Add filter
      </Button>
      <Button size="sm" className="ml-auto h-7 text-xs" onClick={onApply}>
        Apply
      </Button>
    </div>
  )
}
