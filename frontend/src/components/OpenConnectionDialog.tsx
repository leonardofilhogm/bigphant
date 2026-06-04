import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Plug, Search, Server } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DriverLogo } from "@/components/DriverLogo"
import { ConnectionFormDialog } from "@/pages/ConnectionList"
import { cn } from "@/lib/utils"
import { parseAppError } from "@/lib/errors"
import { api } from "@/lib/api"
import { toast } from "sonner"
import type { ConnectionMeta } from "@/lib/types"

interface OpenConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The connection currently active in this window — marked and not re-openable. */
  currentId: string
  /** Switches the window to another connection. Throws on failure. */
  onOpenConnection: (connection: ConnectionMeta) => Promise<void>
  onPlanRequired?: (message: string) => void
}

// A searchable, folder-grouped connection picker reachable from the workspace
// back button. Picking a connection switches the window's active pool without
// dropping back to the connection-list screen — only "Log out" does that.
export function OpenConnectionDialog({
  open,
  onOpenChange,
  currentId,
  onOpenConnection,
  onPlanRequired,
}: OpenConnectionDialogProps) {
  const [connections, setConnections] = useState<ConnectionMeta[]>([])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [opening, setOpening] = useState(false)
  const [showNew, setShowNew] = useState(false)

  async function refresh() {
    try {
      setConnections(await api.listConnections())
    } catch (e) {
      toast.error("Failed to load connections", { description: String(e) })
    }
  }

  // Reload the list (and reset transient state) each time the dialog opens, so
  // edits made elsewhere or newly created connections show up.
  useEffect(() => {
    if (!open) return
    setQuery("")
    setSelected(null)
    refresh()
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return connections
    return connections.filter((c) =>
      [c.name, c.host, c.folder, c.label, c.default_database]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(q))
    )
  }, [connections, query])

  // Group by folder; ungrouped last (mirrors ConnectionList).
  const grouped = useMemo(() => {
    const folders = Array.from(new Set(filtered.map((c) => c.folder).filter(Boolean))).sort()
    return [
      ...folders.map((f) => ({ folder: f, items: filtered.filter((c) => c.folder === f) })),
      { folder: null as string | null, items: filtered.filter((c) => !c.folder) },
    ].filter((g) => g.items.length > 0)
  }, [filtered])

  function toggleFolder(folder: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(folder) ? next.delete(folder) : next.add(folder)
      return next
    })
  }

  async function pick(connection: ConnectionMeta) {
    if (connection.id === currentId || opening) return
    setOpening(true)
    try {
      await onOpenConnection(connection)
      onOpenChange(false)
    } catch (e) {
      const { code, message } = parseAppError(e)
      if (code === "PlanRequired") onPlanRequired?.(message)
      else toast.error("Could not open connection", { description: message })
    } finally {
      setOpening(false)
    }
  }

  const selectedConn = connections.find((c) => c.id === selected) ?? null
  const canOpen = !!selectedConn && selectedConn.id !== currentId && !opening

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-lg"
          onKeyDown={(e) => {
            if (e.key === "Enter" && canOpen && selectedConn) {
              e.preventDefault()
              pick(selectedConn)
            }
          }}
        >
          <div className="px-4 pt-4 pb-3">
            <h2 className="mb-3 text-center text-sm font-semibold">Open Connection</h2>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for connection…"
                className="pl-9"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto border-y py-1">
            {grouped.length === 0 ? (
              <p className="text-muted-foreground px-4 py-8 text-center text-xs">
                No connections match “{query}”.
              </p>
            ) : (
              grouped.map(({ folder, items }) => (
                <div key={folder ?? "__none__"}>
                  {folder && (
                    <button
                      onClick={() => toggleFolder(folder)}
                      className="bg-muted/40 hover:bg-muted/70 flex w-full items-center gap-2 px-4 py-2 text-left"
                    >
                      <ChevronRight
                        className={cn(
                          "text-muted-foreground size-4 transition-transform",
                          !collapsed.has(folder) && "rotate-90"
                        )}
                      />
                      <Plug className="size-5 text-orange-500" />
                      <span className="text-sm font-semibold">{folder}</span>
                    </button>
                  )}

                  {!collapsed.has(folder ?? "") &&
                    items.map((c) => {
                      const isCurrent = c.id === currentId
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelected(c.id)}
                          onDoubleClick={() => pick(c)}
                          disabled={c.locked}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                            folder && "pl-10",
                            c.locked && "opacity-50",
                            selected === c.id ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <DriverLogo
                            driver={c.driver}
                            className="size-8 shrink-0 rounded-full object-contain"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{c.name}</span>
                              {c.label && (
                                <span
                                  className="shrink-0 text-xs font-medium"
                                  style={{ color: c.label_color || undefined }}
                                >
                                  ({c.label})
                                </span>
                              )}
                              {isCurrent && (
                                <span className="ml-1 inline-flex shrink-0 items-center gap-1 text-[10px] text-emerald-500">
                                  <span className="size-1.5 rounded-full bg-emerald-500" />
                                  connected
                                </span>
                              )}
                            </div>
                            <div className="text-muted-foreground flex items-center gap-1 text-xs">
                              <Server className="size-3 shrink-0" />
                              <span className="truncate">
                                {c.host}
                                {c.default_database && ` : ${c.default_database}`}
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNew(true)}>
                New…
              </Button>
              <Button
                size="sm"
                disabled={!canOpen}
                onClick={() => selectedConn && pick(selectedConn)}
              >
                {opening ? "Opening…" : "Open"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showNew && (
        <ConnectionFormDialog
          mode="create"
          forceOpen
          onPlanRequired={onPlanRequired}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false)
            refresh()
          }}
        />
      )}
    </>
  )
}
