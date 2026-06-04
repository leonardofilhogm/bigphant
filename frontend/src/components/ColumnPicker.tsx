import { useState } from "react"
import { Columns3, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { Column } from "@/lib/types"

interface ColumnPickerProps {
  columns: Column[]
  visible: Set<string>
  onToggle: (name: string) => void
  onSetAll: (visible: boolean) => void
}

export function ColumnPicker({ columns, visible, onToggle, onSetAll }: ColumnPickerProps) {
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()
  const filtered = query
    ? columns.filter((c) => c.name.toLowerCase().includes(query))
    : columns

  return (
    <DropdownMenu onOpenChange={(open) => !open && setSearch("")}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <Columns3 className="size-3.5" /> Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">Visible columns</DropdownMenuLabel>
        <div className="flex items-center gap-1 px-1 pb-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 flex-1 text-[11px]"
            onClick={(e) => {
              e.preventDefault()
              onSetAll(true)
            }}
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 flex-1 text-[11px]"
            onClick={(e) => {
              e.preventDefault()
              onSetAll(false)
            }}
          >
            Unselect all
          </Button>
        </div>
        <div className="px-1 pb-1">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-2 top-1/2 size-3 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search columns…"
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-auto">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground px-2 py-1.5 text-xs">No columns.</div>
          ) : (
            filtered.map((c) => (
              <label
                key={c.name}
                className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs"
                onClick={(e) => e.preventDefault()}
              >
                <Checkbox
                  checked={visible.has(c.name)}
                  onCheckedChange={() => onToggle(c.name)}
                />
                <span className="truncate">{c.name}</span>
              </label>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
