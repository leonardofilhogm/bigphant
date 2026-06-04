import { useState } from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Column } from "@/lib/types"

interface ColumnSelectProps {
  columns: Column[]
  value: string
  onChange: (name: string) => void
  className?: string
}

export function ColumnSelect({ columns, value, onChange, className }: ColumnSelectProps) {
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()
  const filtered = query
    ? columns.filter((c) => c.name.toLowerCase().includes(query))
    : columns

  return (
    <DropdownMenu onOpenChange={(open) => !open && setSearch("")}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 justify-between gap-2 text-xs font-normal", className)}
        >
          <span className="truncate">{value || "column"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
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
        <div className="max-h-72 overflow-auto">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground px-2 py-1.5 text-xs">No columns.</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => onChange(c.name)}
                className="hover:bg-accent flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
              >
                <Check
                  className={cn("size-3.5 shrink-0", c.name === value ? "opacity-100" : "opacity-0")}
                />
                <span className="truncate">{c.name}</span>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
