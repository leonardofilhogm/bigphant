import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"

interface DBContextEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  database: string
}

// DBContextEditor lets the user view and edit the Markdown context file the AI
// Assistant reads, or regenerate it from the live schema (regenerating discards
// manual edits).
export function DBContextEditor({ open, onOpenChange, database }: DBContextEditorProps) {
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api
      .getDBContext(database)
      .then(setContent)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load context"))
      .finally(() => setLoading(false))
  }, [open, database])

  async function save() {
    setSaving(true)
    try {
      await api.saveDBContext(database, content)
      toast.success("Context saved")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save context")
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    setRegenerating(true)
    try {
      const md = await api.generateDBContext(database)
      setContent(md)
      toast.success("Context regenerated from schema")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not regenerate context")
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Database context — {database}</DialogTitle>
          <DialogDescription>
            This Markdown grounds the AI Assistant. Add table and column notes or business rules;
            "Regenerate" re-syncs the schema and discards manual edits.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={loading}
          spellCheck={false}
          className="min-h-[50vh] flex-1 font-mono text-xs"
          placeholder={loading ? "Loading…" : "No context yet — click Regenerate to build it from the schema."}
        />

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={regenerate} disabled={regenerating}>
            {regenerating ? "Regenerating…" : "Regenerate from schema"}
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
