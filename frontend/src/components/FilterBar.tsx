import { Check, Eraser, Plus, X } from "lucide-react"
import { Fragment } from "react"

import { ColumnSelect } from "@/components/ColumnSelect"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Column, Comparator, Filter } from "@/lib/types"
import { cn } from "@/lib/utils"

// Comparator menu, grouped to mirror TablePlus (with separators between groups).
// The case-sensitive LIKE variants are intentionally collapsed into one option.
const comparatorGroups: Comparator[][] = [
  ["=", "<>", "<", ">", "<=", ">="],
  ["IN", "NOT IN"],
  ["IS NULL", "IS NOT NULL"],
  ["BETWEEN", "NOT BETWEEN"],
  ["LIKE"],
  ["Contains", "Not contains"],
  ["Starts with", "Ends with"],
]

const valueless = (c: Comparator) => c === "IS NULL" || c === "IS NOT NULL"

// Comparators whose value is a comma-separated list rather than a single scalar.
const listComparator = (c: Comparator) =>
  c === "IN" || c === "NOT IN" || c === "BETWEEN" || c === "NOT BETWEEN"

function valuePlaceholder(c: Comparator): string {
  if (c === "IN" || c === "NOT IN") return "a, b, c"
  if (c === "BETWEEN" || c === "NOT BETWEEN") return "min, max"
  if (c === "Contains" || c === "Not contains") return "substring"
  if (c === "Starts with") return "prefix"
  if (c === "Ends with") return "suffix"
  return "value"
}

interface FilterBarProps {
  columns: Column[]
  filters: Filter[]
  onChange: (filters: Filter[]) => void
  onApply: () => void
  onClear: () => void
}

export function FilterBar({ columns, filters, onChange, onApply, onClear }: FilterBarProps) {
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
    <div className="bg-muted/30 flex items-start gap-2 border-b px-2 py-1.5">
      {/* Filter rows: this column flexes so each value input fills the width. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {filters.length === 0 && (
          <span className="text-muted-foreground py-1.5 text-xs">No filters.</span>
        )}

        {filters.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Checkbox
              checked={f.enabled !== false}
              onCheckedChange={(v) => update(i, { enabled: v === true })}
              className="ml-0.5 shrink-0"
              title={f.enabled !== false ? "Filter enabled" : "Filter disabled"}
            />
            <span className="text-muted-foreground w-7 shrink-0 text-[10px] font-medium">
              {i > 0 ? "AND" : ""}
            </span>
            <ColumnSelect
              columns={columns}
              value={f.column}
              onChange={(v) => update(i, { column: v })}
              className="w-44 shrink-0"
            />
            <Select value={f.comparator} onValueChange={(v) => update(i, { comparator: v as Comparator })}>
              <SelectTrigger size="sm" className="w-32 shrink-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {comparatorGroups.map((group, gi) => (
                  <Fragment key={gi}>
                    {gi > 0 && <SelectSeparator />}
                    {group.map((c) => (
                      <SelectItem key={c} value={c} className="font-mono text-xs">
                        {c}
                      </SelectItem>
                    ))}
                  </Fragment>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={f.value}
              disabled={valueless(f.comparator)}
              onChange={(e) => update(i, { value: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && onApply()}
              placeholder={valuePlaceholder(f.comparator)}
              className={cn(
                "h-8 min-w-0 flex-1 text-xs",
                listComparator(f.comparator) && "font-mono"
              )}
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7 shrink-0"
              onClick={() => remove(i)}
              title="Remove filter"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Actions pinned to the top-right, aligned with the first row. */}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7"
          onClick={onClear}
          disabled={filters.length === 0}
          title="Clear filters"
        >
          <Eraser className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          onClick={add}
          title="Add filter"
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          size="icon"
          className="size-7"
          onClick={onApply}
          disabled={filters.length === 0}
          title="Apply filters"
        >
          <Check className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
