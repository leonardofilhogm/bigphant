import { useState } from "react"
import { Database, ShieldCheck, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"
import type { AIEnableResult } from "@/lib/types"

interface AIConsentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  database: string
  onEnabled: (result: AIEnableResult) => void
}

// AIConsentDialog is the explicit opt-in gate. Enabling the assistant maps the
// schema into an editable context file and provisions a read-only database user
// (falling back to app-layer read-only enforcement if it can't). The user must
// agree before anything runs.
export function AIConsentDialog({ open, onOpenChange, database, onEnabled }: AIConsentDialogProps) {
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function enable() {
    setBusy(true)
    try {
      const result = await api.enableAIAssistant(database)
      onEnabled(result)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enable the AI Assistant")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Enable the AI Assistant
          </DialogTitle>
          <DialogDescription>
            Ask plain-language questions about <span className="font-medium">{database}</span>.
            Before it can help, Bigphant needs your permission to do two things:
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 text-sm">
          <li className="flex gap-2">
            <Database className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">Map the schema.</span> Read your tables, columns and
              indexes into an editable Markdown context file the assistant uses for grounding.
            </span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">Create a read-only user.</span> Provision a
              SELECT-only database user so every AI query is read-only. If your account can't
              create users, Bigphant falls back to enforcing read-only access in the app.
            </span>
          </li>
        </ul>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
          <span>
            I agree that Bigphant may introspect this database and provision a read-only user for
            the AI Assistant.
          </span>
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={enable} disabled={!agreed || busy}>
            {busy ? "Enabling…" : "Enable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
