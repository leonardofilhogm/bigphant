import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import type { AppSettings, AIModel } from "@/lib/types"

interface SettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: AppSettings
  onChange: (settings: AppSettings) => void
  connectionReadOnly: boolean
  onConnectionReadOnlyChange: (v: boolean) => void
  onReplayWelcome?: () => void
}

export function Settings({
  open,
  onOpenChange,
  settings,
  onChange,
  connectionReadOnly,
  onConnectionReadOnlyChange,
  onReplayWelcome,
}: SettingsProps) {
  const { theme, setTheme } = useTheme()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Preferences apply to this workspace.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Row
            label="Allow destructive operations without WHERE"
            hint="When off, UPDATE/DELETE without WHERE is blocked entirely."
          >
            <Switch
              checked={settings.allow_destructive_without_where}
              onCheckedChange={(v) =>
                onChange({ ...settings, allow_destructive_without_where: v })
              }
            />
          </Row>

          <Separator />

          <Row label="Transaction mode" hint="Explicit commit wraps mutations in a transaction.">
            <Select
              value={settings.default_transaction_mode}
              onValueChange={(v) =>
                onChange({
                  ...settings,
                  default_transaction_mode: v as AppSettings["default_transaction_mode"],
                })
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto_commit">Auto-commit</SelectItem>
                <SelectItem value="explicit_commit">Explicit commit</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Separator />

          <Row label="Read-only connection" hint="Blocks any non-SELECT query on this connection.">
            <Switch checked={connectionReadOnly} onCheckedChange={onConnectionReadOnlyChange} />
          </Row>

          <Separator />

          <Row label="Theme">
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Separator />

          <AISettingsSection open={open} />

          {onReplayWelcome && (
            <>
              <Separator />
              <div className="space-y-1">
                <Label className="text-sm">Intro</Label>
                <button
                  type="button"
                  className="text-primary block text-sm underline-offset-4 hover:underline"
                  onClick={() => {
                    onOpenChange(false)
                    onReplayWelcome()
                  }}
                >
                  Replay welcome
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// AISettingsSection manages the bring-your-own-key OpenRouter config: the API
// key (write-only — never read back) and the model, chosen from a live list
// fetched from OpenRouter.
function AISettingsSection({ open }: { open: boolean }) {
  const [hasKey, setHasKey] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")
  const [models, setModels] = useState<AIModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    api
      .getAIConfig()
      .then((c) => {
        setHasKey(c.has_key)
        setModel(c.model)
      })
      .catch(() => {})
  }, [open])

  const loadModels = async () => {
    setLoadingModels(true)
    try {
      setModels(await api.listAIModels())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load models")
    } finally {
      setLoadingModels(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.setAIConfig(apiKey, model)
      setApiKey("")
      const c = await api.getAIConfig()
      setHasKey(c.has_key)
      setModel(c.model)
      toast.success("AI settings saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save AI settings")
    } finally {
      setSaving(false)
    }
  }

  // Show the current model even if the full list hasn't been fetched yet.
  const modelOptions = models.length
    ? models
    : model
      ? [{ id: model, name: model, context_length: 0 }]
      : []

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <Label className="text-sm">AI Assistant (OpenRouter)</Label>
        <p className="text-muted-foreground text-xs">
          Bring your own OpenRouter API key to ask plain-language questions about your
          database. The key is encrypted on disk and never leaves your machine except to
          OpenRouter.
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">OpenRouter API key</Label>
        <Input
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={hasKey ? "•••••••• (key set — leave blank to keep)" : "sk-or-..."}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Model</Label>
        <div className="flex items-center gap-2">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {modelOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name || m.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={loadModels} disabled={loadingModels}>
            {loadingModels ? "Loading…" : "Load models"}
          </Button>
        </div>
      </div>

      <Button type="button" size="sm" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save AI settings"}
      </Button>
    </div>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-sm">{label}</Label>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )
}
