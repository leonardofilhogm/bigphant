import { GitCommitHorizontal, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"

interface TransactionBarProps {
  pendingStatements: number
  onCommit: () => void
  onRollback: () => void
}

export function TransactionBar({ pendingStatements, onCommit, onRollback }: TransactionBarProps) {
  return (
    <div className="flex items-center gap-3 border-t border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs">
      <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
        </span>
        Transaction open — {pendingStatements} uncommitted statement
        {pendingStatements === 1 ? "" : "s"}
      </span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={onRollback}>
          <Undo2 className="size-3.5" /> Rollback
        </Button>
        <Button size="sm" className="h-6 gap-1 text-xs" onClick={onCommit}>
          <GitCommitHorizontal className="size-3.5" /> Commit
        </Button>
      </div>
    </div>
  )
}
