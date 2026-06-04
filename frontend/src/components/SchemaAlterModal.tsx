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

interface SchemaAlterModalProps {
  sql: string[] | null
  destructive: boolean
  applying?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function SchemaAlterModal({
  sql,
  destructive,
  applying,
  onConfirm,
  onClose,
}: SchemaAlterModalProps) {
  const text = sql?.join(";\n") ?? ""
  return (
    <Dialog open={sql !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && <AlertTriangle className="text-destructive size-4" />}
            {destructive ? "Confirm schema change" : "Preview schema change"}
          </DialogTitle>
          <DialogDescription>
            {destructive
              ? "This change may remove data or break dependencies. Review the SQL before applying."
              : "Review the server-generated SQL before applying."}
          </DialogDescription>
        </DialogHeader>

        <pre className="bg-muted text-foreground max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
          {text}
        </pre>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
            disabled={applying}
          >
            {applying ? "Applying…" : destructive ? "Apply change" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
