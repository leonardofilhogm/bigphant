import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface DestructiveOpModalProps {
  sql: string | null
  /** When true the operation is hard-blocked and cannot be confirmed
   *  (Settings → "Allow destructive operations without WHERE" is OFF). */
  blocked: boolean
  onConfirm: () => void
  onClose: () => void
}

export function DestructiveOpModal({ sql, blocked, onConfirm, onClose }: DestructiveOpModalProps) {
  return (
    <Dialog open={sql !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            Destructive operation
          </DialogTitle>
          <DialogDescription>
            {blocked
              ? "This statement is blocked. Enable “Allow destructive operations without WHERE” in Settings to run it."
              : "Review the SQL below before it runs. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        <pre className="bg-muted text-foreground max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
          {sql}
        </pre>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" disabled={blocked} onClick={onConfirm}>
            {blocked ? "Blocked" : "Run anyway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
