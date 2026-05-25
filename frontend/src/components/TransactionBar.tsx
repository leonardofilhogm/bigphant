import { useState } from "react"
import { GitCommitHorizontal, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"

export interface TxEntry {
  id: number
  at: Date
  label: string
}

interface TransactionBarProps {
  entries: TxEntry[]
  onCommit: () => void
  onRollback: () => void
}

function fmt(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function TransactionBar({ entries, onCommit, onRollback }: TransactionBarProps) {
  const [open, setOpen] = useState(false)
  const count = entries.length

  return (
    <>
      <div className="flex items-center gap-3 border-t border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 font-medium text-amber-700 hover:underline dark:text-amber-400"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
          </span>
          Transaction open — {count} uncommitted statement{count === 1 ? "" : "s"}
        </button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={onRollback}>
            <Undo2 className="size-3.5" /> Rollback
          </Button>
          <Button size="sm" className="h-6 gap-1 text-xs" onClick={onCommit}>
            <GitCommitHorizontal className="size-3.5" /> Commit
          </Button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-[400px] flex-col gap-0 p-0 sm:max-w-[400px]">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-sm">Pending transaction</SheetTitle>
            <SheetDescription className="text-xs">
              {count} uncommitted statement{count === 1 ? "" : "s"} — not yet visible to other sessions.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-auto">
            <ul className="divide-y">
              {entries.map((e, i) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground mt-0.5 w-5 shrink-0 text-center text-[10px] tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-mono">{e.label}</p>
                    <p className="text-muted-foreground text-[10px]">{fmt(e.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => { onRollback(); setOpen(false) }}
            >
              <Undo2 className="size-3.5" /> Rollback
            </Button>
            <Button
              size="sm"
              className="gap-1"
              onClick={() => { onCommit(); setOpen(false) }}
            >
              <GitCommitHorizontal className="size-3.5" /> Commit
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
