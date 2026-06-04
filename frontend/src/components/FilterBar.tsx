import { Plus, X } from "lucide-react"

import { ColumnSelect } from "@/components/ColumnSelect"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
    onChange([...filters, { column: columns[0]?.name ?? "", comparator: "=", value: "", enabled: true }])
  }
  function remove(i: number) {
    onChange(filters.filter((_, idx) => idx !== i))
  }

  return (
    <div className="bg-muted/30 flex flex-col gap-1 border-b px-2 py-1.5">
      {filters.length === 0 && (
        <span className="text-muted-foreground text-xs">No filters.</span>
      )}

      {filters.map((f, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="text-muted-foreground w-8 shrink-0 text-right text-[10px] font-medium">
            {i > 0 ? "AND" : ""}
          </span>
          <Checkbox
            checked={f.enabled !== false}
            onCheckedChange={(v) => update(i, { enabled: v === true })}
            className="shrink-0"
            title={f.enabled !== false ? "Filter enabled" : "Filter disabled"}
          />
          <ColumnSelect
            columns={columns}
            value={f.column}
            onChange={(v) => update(i, { column: v })}
            className="w-44 shrink-0"
          />
          <Select value={f.comparator} onValueChange={(v) => update(i, { comparator: v as Comparator })}>
            <SelectTrigger size="sm" className="w-28 shrink-0 text-xs">
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
            onKeyDown={(e) => e.key === "Enter" && onApply()}
            placeholder="value"
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => remove(i)}>
            <X className="size-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={add}>
          <Plus className="size-3.5" /> Add filter
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={onApply}>
          Apply
        </Button>
      </div>
    </div>
  )
}
