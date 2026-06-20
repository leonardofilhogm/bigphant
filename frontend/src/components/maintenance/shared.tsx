import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"

export interface MaintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  driver: string
  database: string
  canModifySchema?: boolean
  onPlanRequired?: (message: string) => void
  onSuccess?: () => void
}

export function MaintRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-sm">{label}</Label>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <div className="min-w-0 shrink-0 pt-0.5">{children}</div>
    </div>
  )
}

export function UnsupportedState({ feature }: { feature: string }) {
  return (
    <p className="text-muted-foreground py-8 text-center text-sm">
      {feature} is not available for this connection type.
    </p>
  )
}

export function isPostgres(driver: string) {
  return driver === "postgres"
}

export function isSQLite(driver: string) {
  return driver === "sqlite"
}

export function isMySQLFamily(driver: string) {
  return driver === "" || driver === "mysql" || driver === "mariadb"
}
