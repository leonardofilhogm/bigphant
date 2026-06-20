import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"
import { isPlanRequired, parseAppError } from "@/lib/errors"
import type { RawResult, ServerCapabilities } from "@/lib/types"
import { isSQLite, MaintDialogProps, MaintRow } from "./shared"

export function MaintenanceTools({
  open,
  onOpenChange,
  driver,
  database,
  canModifySchema,
  onPlanRequired,
}: MaintDialogProps) {
  const [caps, setCaps] = useState<ServerCapabilities | null>(null)
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState("")
  const [result, setResult] = useState<RawResult | null>(null)
  const [pendingOp, setPendingOp] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setResult(null)
    api
      .serverCapabilities()
      .then(setCaps)
      .catch((e) => toast.error(parseAppError(e).message))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (open && database && !isSQLite(driver)) {
      setTarget(database)
    }
  }, [open, database, driver])

  async function runOp(op: string) {
    if (!canModifySchema) {
      onPlanRequired?.("Upgrade to Pro to run maintenance operations.")
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const res = await api.runMaintenance(op, target)
      setResult(res)
      toast.success(`${op} completed`, {
        description: res.duration_ms ? `${res.duration_ms} ms` : undefined,
      })
      setPendingOp(null)
    } catch (e) {
      if (isPlanRequired(e)) onPlanRequired?.(parseAppError(e).message)
      else toast.error(parseAppError(e).message)
    } finally {
      setRunning(false)
    }
  }

  const ops = caps?.maintenance_ops ?? []
  const needsTarget = !isSQLite(driver)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Database Maintenance</DialogTitle>
            <DialogDescription>
              Run server maintenance operations on the connected database.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
          ) : ops.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No maintenance operations available.
            </p>
          ) : (
            <div className="grid gap-4">
              {needsTarget && (
                <MaintRow
                  label="Target"
                  hint={isSQLite(driver) ? undefined : "Database or schema.table"}
                >
                  <Input
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="h-8 w-52"
                    placeholder={database || "target"}
                  />
                </MaintRow>
              )}

              <div className="flex flex-wrap gap-2">
                {ops.map((op) => (
                  <Button
                    key={op}
                    variant="outline"
                    size="sm"
                    disabled={running || (needsTarget && !target && op !== "VACUUM")}
                    onClick={() => {
                      if (op === "VACUUM" || op === "INTEGRITY_CHECK" || op === "REINDEX") {
                        setPendingOp(op)
                      } else {
                        void runOp(op)
                      }
                    }}
                  >
                    {op.replace("_", " ")}
                  </Button>
                ))}
              </div>

              {result && (
                <div className="bg-muted max-h-40 overflow-auto rounded p-2 text-xs">
                  {result.is_query && result.result_set ? (
                    <pre>{JSON.stringify(result.result_set.rows, null, 2)}</pre>
                  ) : (
                    <p>
                      Done in {result.duration_ms} ms
                      {result.affected_rows > 0 && ` · ${result.affected_rows} rows affected`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingOp} onOpenChange={(o) => !o && setPendingOp(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Run {pendingOp?.replace("_", " ")}?</DialogTitle>
            <DialogDescription>
              This operation may lock tables or consume significant I/O. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingOp(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={running}
              onClick={() => pendingOp && void runOp(pendingOp)}
            >
              {running ? "Running…" : "Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
