import { Columns3 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Column } from "@/lib/types"

interface ColumnPickerProps {
  columns: Column[]
  visible: Set<string>
  onToggle: (name: string) => void
}

export function ColumnPicker({ columns, visible, onToggle }: ColumnPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <Columns3 className="size-3.5" /> Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs">Visible columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((c) => (
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
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
