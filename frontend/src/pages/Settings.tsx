import { useTheme } from "next-themes"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AppSettings } from "@/lib/types"

interface SettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: AppSettings
  onChange: (settings: AppSettings) => void
  connectionReadOnly: boolean
  onConnectionReadOnlyChange: (v: boolean) => void
}

export function Settings({
  open,
  onOpenChange,
  settings,
  onChange,
  connectionReadOnly,
  onConnectionReadOnlyChange,
}: SettingsProps) {
  const { theme, setTheme } = useTheme()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Preferences apply to this workspace.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
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
        </div>
      </DialogContent>
    </Dialog>
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
