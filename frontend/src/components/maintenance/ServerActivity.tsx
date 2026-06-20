import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, Skull } from "lucide-react"
import { toast } from "sonner"

import { DataGrid } from "@/components/DataGrid"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { isPlanRequired, parseAppError } from "@/lib/errors"
import type { Column, LockInfo, ServerCapabilities, ServerProcess } from "@/lib/types"
import { MaintDialogProps, UnsupportedState } from "./shared"

function processesToGrid(processes: ServerProcess[]) {
  const columns: Column[] = [
    { name: "id", type: "string" },
    { name: "user", type: "string" },
    { name: "host", type: "string" },
    { name: "database", type: "string" },
    { name: "command", type: "string" },
    { name: "time_sec", type: "int" },
    { name: "state", type: "string" },
    { name: "query", type: "string" },
  ]
  const rows = processes.map((p) => [
    p.id,
    p.user,
    p.host,
    p.database,
    p.command,
    p.time_sec,
    p.state,
    p.query,
  ])
  return { columns, rows }
}

function locksToGrid(locks: LockInfo[]) {
  const columns: Column[] = [
    { name: "lock_type", type: "string" },
    { name: "database", type: "string" },
    { name: "table", type: "string" },
    { name: "blocked_by", type: "string" },
    { name: "wait_sec", type: "int" },
    { name: "blocked_query", type: "string" },
  ]
  const rows = locks.map((l) => [
    l.lock_type,
    l.database,
    l.table,
    l.blocked_by,
    l.wait_sec,
    l.blocked_query,
  ])
  return { columns, rows }
}

export function ServerActivity({
  open,
  onOpenChange,
  canModifySchema,
  onPlanRequired,
}: MaintDialogProps) {
  const [caps, setCaps] = useState<ServerCapabilities | null>(null)
  const [loading, setLoading] = useState(false)
  const [processes, setProcesses] = useState<ServerProcess[]>([])
  const [locks, setLocks] = useState<LockInfo[]>([])
  const [killTarget, setKillTarget] = useState<ServerProcess | null>(null)
  const [killing, setKilling] = useState(false)

  const refresh = useCallback(async () => {
    const [activity, lockList] = await Promise.all([
      api.listActivity(),
      api.listLocks(),
    ])
    setProcesses(activity)
    setLocks(lockList)
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api
      .serverCapabilities()
      .then(async (c) => {
        setCaps(c)
        if (c.view_activity) await refresh()
      })
      .catch((e) => toast.error(parseAppError(e).message))
      .finally(() => setLoading(false))
  }, [open, refresh])

  const procGrid = useMemo(() => processesToGrid(processes), [processes])
  const lockGrid = useMemo(() => locksToGrid(locks), [locks])

  async function handleKill() {
    if (!killTarget) return
    if (!canModifySchema) {
      onPlanRequired?.("Upgrade to Pro to kill server processes.")
      return
    }
    setKilling(true)
    try {
      await api.killProcess(killTarget.id)
      toast.success("Process terminated")
      setKillTarget(null)
      await refresh()
    } catch (e) {
      if (isPlanRequired(e)) onPlanRequired?.(parseAppError(e).message)
      else toast.error(parseAppError(e).message)
    } finally {
      setKilling(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Server Activity</DialogTitle>
            <DialogDescription>
              Running queries and lock waits on the connected server.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
          ) : !caps?.view_activity ? (
            <UnsupportedState feature="Server activity" />
          ) : (
            <>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => refresh()}>
                  <RefreshCw className="size-3.5" /> Refresh
                </Button>
              </div>
              <Tabs defaultValue="processes" className="flex min-h-0 flex-1 flex-col">
                <TabsList>
                  <TabsTrigger value="processes">Processes ({processes.length})</TabsTrigger>
                  <TabsTrigger value="locks">Locks ({locks.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="processes" className="min-h-0 flex-1 overflow-hidden">
                  <div className="mb-2 flex gap-2">
                    {processes.slice(0, 20).map((p) => (
                      <Button
                        key={p.id}
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => setKillTarget(p)}
                      >
                        <Skull className="size-3" /> Kill #{p.id}
                      </Button>
                    ))}
                  </div>
                  <div className="max-h-64 overflow-auto rounded border">
                    <DataGrid
                      columns={procGrid.columns}
                      visible={new Set(procGrid.columns.map((c) => c.name))}
                      rows={procGrid.rows}
                      selected={new Set()}
                      activeRow={null}
                      onToggleRow={() => {}}
                      onToggleAll={() => {}}
                      onRowClick={() => {}}
                      onCellCommit={() => {}}
                      editMode="side_panel"
                      readOnly
                    />
                  </div>
                </TabsContent>
                <TabsContent value="locks" className="min-h-0 flex-1 overflow-hidden">
                  <div className="max-h-72 overflow-auto rounded border">
                    <DataGrid
                      columns={lockGrid.columns}
                      visible={new Set(lockGrid.columns.map((c) => c.name))}
                      rows={lockGrid.rows}
                      selected={new Set()}
                      activeRow={null}
                      onToggleRow={() => {}}
                      onToggleAll={() => {}}
                      onRowClick={() => {}}
                      onCellCommit={() => {}}
                      editMode="side_panel"
                      readOnly
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!killTarget} onOpenChange={(o) => !o && setKillTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Kill process?</DialogTitle>
            <DialogDescription>
              Terminate process <strong>#{killTarget?.id}</strong>? This may roll back
              uncommitted work.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setKillTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={killing} onClick={handleKill}>
              {killing ? "Killing…" : "Kill process"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
