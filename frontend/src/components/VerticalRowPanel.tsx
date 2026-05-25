import { useEffect, useState } from "react"
import { KeyRound, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { Column } from "@/lib/types"

interface VerticalRowPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: Column[]
  primaryKey: string[]
  row: unknown[] | null
  isNew?: boolean
  onSave: (values: Record<string, string | null>) => void
}

function toEditable(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  return String(value)
}

export function VerticalRowPanel({
  open,
  onOpenChange,
  columns,
  primaryKey,
  row,
  isNew = false,
  onSave,
}: VerticalRowPanelProps) {
  const [draft, setDraft] = useState<Record<string, string | null>>({})
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (row) {
      const next: Record<string, string | null> = {}
      columns.forEach((c, i) => (next[c.name] = toEditable(row[i])))
      setDraft(next)
      setSearch("")
    }
  }, [row, columns])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[380px] flex-col gap-0 p-0 sm:max-w-[380px]">
        <SheetHeader className="border-b">
          <SheetTitle className="text-sm">{isNew ? "Add row" : "Edit row"}</SheetTitle>
          <SheetDescription className="text-xs">
            {isNew
              ? "Saving generates an INSERT."
              : "Saving generates an UPDATE keyed by the primary key."}
          </SheetDescription>
        </SheetHeader>

        <div className="border-b px-4 py-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-2 top-1/2 size-3 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter fields…"
              className="h-7 pl-6 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
          {columns.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).map((c) => {
            const i = columns.indexOf(c)
            const isPk = primaryKey.includes(c.name)
            const isJson = typeof row?.[i] === "object" && row?.[i] !== null
            const isNull = draft[c.name] === null
            const isDisabled = (isPk && !isNew) || isNull
            return (
              <div key={c.name} className="grid gap-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  {isPk && <KeyRound className="size-3 text-amber-500" />}
                  <span className={cn(isPk && "font-semibold")}>{c.name}</span>
                  <span className="text-muted-foreground font-normal">{c.type}</span>
                  {!isPk && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, [c.name]: isNull ? "" : null })
                      }
                      className={cn(
                        "ml-auto rounded px-1 py-0.5 font-mono text-[10px] transition-colors",
                        isNull
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      NULL
                    </button>
                  )}
                </Label>
                {isJson && !isNull ? (
                  <Textarea
                    rows={4}
                    value={draft[c.name] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [c.name]: e.target.value })}
                    className="font-mono text-xs"
                  />
                ) : (
                  <Input
                    value={isNull ? "" : (draft[c.name] ?? "")}
                    onChange={(e) => setDraft({ ...draft, [c.name]: e.target.value })}
                    placeholder={isNull ? "NULL" : (isPk && isNew ? "auto" : undefined)}
                    className={cn(
                      "h-8 font-mono text-xs",
                      isNull && "text-muted-foreground italic",
                      isPk && isNew && !draft[c.name] && "text-muted-foreground"
                    )}
                    disabled={isDisabled}
                  />
                )}
              </div>
            )
          })}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(draft)}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
