import { useEffect, useState } from "react"
import { ChevronRight, FolderOpen, Lock, Pencil, Plus, Server, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ModeToggle } from "@/components/mode-toggle"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Logo } from "@/components/Logo"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import type { ConnectionInput, ConnectionMeta, TransactionMode } from "@/lib/types"

// ── Driver avatar ────────────────────────────────────────────────────────────

const DRIVER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  mysql:    { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-600 dark:text-orange-400", label: "My" },
  postgres: { bg: "bg-sky-100 dark:bg-sky-900/40",      text: "text-sky-600 dark:text-sky-400",      label: "Pg" },
  sqlite:   { bg: "bg-teal-100 dark:bg-teal-900/40",    text: "text-teal-600 dark:text-teal-400",    label: "Sq" },
}

function DriverAvatar({ driver }: { driver: string }) {
  if (driver === "mysql") {
    return <Logo className="size-9 shrink-0 rounded-lg" />
  }
  const style = DRIVER_STYLES[driver] ?? {
    bg: "bg-muted", text: "text-muted-foreground", label: "DB",
  }
  return (
    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold", style.bg, style.text)}>
      {style.label}
    </div>
  )
}

// ── Label color palette ──────────────────────────────────────────────────────

const LABEL_PRESETS = [
  { color: "#ef4444", name: "Red" },
  { color: "#f97316", name: "Orange" },
  { color: "#eab308", name: "Yellow" },
  { color: "#22c55e", name: "Green" },
  { color: "#3b82f6", name: "Blue" },
  { color: "#8b5cf6", name: "Purple" },
  { color: "#ec4899", name: "Pink" },
  { color: "#6b7280", name: "Gray" },
]

// ── Defaults ─────────────────────────────────────────────────────────────────

const emptyInput: ConnectionInput = {
  name: "",
  driver: "mysql",
  host: "127.0.0.1",
  port: 3306,
  username: "root",
  password: "",
  default_database: "",
  read_only: false,
  transaction_mode: "auto_commit",
  label: "",
  label_color: "",
  folder: "",
}

// ── ConnectionList ────────────────────────────────────────────────────────────

interface ConnectionListProps {
  onOpen: (connection: ConnectionMeta) => void
}

export function ConnectionList({ onOpen }: ConnectionListProps) {
  const [connections, setConnections] = useState<ConnectionMeta[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [editTarget, setEditTarget] = useState<ConnectionMeta | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ConnectionMeta | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  async function refresh() {
    try {
      const list = await api.listConnections()
      setConnections(list)
      setSelected((cur) => cur ?? list[0]?.id ?? null)
    } catch (e) {
      toast.error("Failed to load connections", { description: String(e) })
    }
  }

  useEffect(() => { refresh() }, [])

  async function open(connection: ConnectionMeta) {
    setOpening(true)
    try {
      await api.openConnection(connection.id)
      onOpen(connection)
    } catch (e) {
      toast.error("Could not open connection", { description: String(e) })
    } finally {
      setOpening(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteConnection(deleteTarget.id)
      toast.success(`"${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
      setSelected((cur) => (cur === deleteTarget.id ? null : cur))
      await refresh()
    } catch (e) {
      toast.error("Could not delete connection", { description: String(e) })
    } finally {
      setDeleting(false)
    }
  }

  function toggleFolder(folder: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(folder) ? next.delete(folder) : next.add(folder)
      return next
    })
  }

  const selectedConn = connections.find((c) => c.id === selected) ?? null

  // Group by folder; ungrouped last
  const folders = Array.from(new Set(connections.map((c) => c.folder).filter(Boolean))).sort()
  const grouped: Array<{ folder: string | null; items: ConnectionMeta[] }> = [
    ...folders.map((f) => ({ folder: f, items: connections.filter((c) => c.folder === f) })),
    { folder: null, items: connections.filter((c) => !c.folder) },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="bg-muted/30 flex h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <img
            src="/favicon.png"
            alt="Bigphant"
            className="size-7 rounded-md object-contain"
            style={{ background: "#FDE3EA" }}
          />
          <span className="text-sm font-semibold">Bigphant</span>
        </div>
        <ModeToggle />
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="bg-background w-full max-w-md rounded-xl border shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h1 className="text-sm font-semibold">Connections</h1>
              <p className="text-muted-foreground text-xs">
                {connections.length === 0
                  ? "No connections yet — create one to get started"
                  : "Double-click a connection to open a workspace"}
              </p>
            </div>
            <ConnectionFormDialog mode="create" onSaved={refresh} />
          </div>

          {connections.length > 0 && (
            <div className="max-h-[480px] overflow-auto py-1">
              {grouped.map(({ folder, items }) => (
                <div key={folder ?? "__none__"}>
                  {folder && (
                    <button
                      onClick={() => toggleFolder(folder)}
                      className="hover:bg-accent/50 flex w-full items-center gap-1.5 px-4 py-1.5 text-left"
                    >
                      <ChevronRight
                        className={cn(
                          "text-muted-foreground size-3.5 transition-transform",
                          !collapsed.has(folder) && "rotate-90"
                        )}
                      />
                      <FolderOpen className="text-muted-foreground size-3.5" />
                      <span className="text-muted-foreground text-xs font-medium">{folder}</span>
                      <span className="text-muted-foreground ml-auto text-[10px]">{items.length}</span>
                    </button>
                  )}

                  {!collapsed.has(folder ?? "") && (
                    <ul>
                      {items.map((c) => (
                        <li key={c.id} className="group relative">
                          <button
                            onClick={() => setSelected(c.id)}
                            onDoubleClick={() => open(c)}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                              folder && "pl-8",
                              selected === c.id ? "bg-accent" : "hover:bg-accent/50"
                            )}
                          >
                            <DriverAvatar driver={c.driver} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium">{c.name}</span>
                                {c.label && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                    style={{
                                      background: c.label_color ? c.label_color + "22" : undefined,
                                      color: c.label_color || undefined,
                                    }}
                                  >
                                    <span
                                      className="size-1.5 rounded-full"
                                      style={{ background: c.label_color || "#6b7280" }}
                                    />
                                    {c.label}
                                  </span>
                                )}
                                {c.read_only && (
                                  <Badge variant="secondary" className="h-4 gap-1 px-1.5 text-[10px]">
                                    <Lock className="size-2.5" /> read-only
                                  </Badge>
                                )}
                              </div>
                              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                                <Server className="size-3" />
                                <span className="truncate">
                                  {c.username}@{c.host}:{c.port}
                                  {c.default_database && `/${c.default_database}`}
                                </span>
                              </div>
                            </div>
                          </button>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={(e) => { e.stopPropagation(); setEditTarget(c) }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive size-7"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end border-t px-4 py-3">
            <Button
              size="sm"
              disabled={!selectedConn || opening}
              onClick={() => selectedConn && open(selectedConn)}
            >
              {opening ? "Opening…" : "Connect"}
            </Button>
          </div>
        </div>
      </div>

      {editTarget && (
        <ConnectionFormDialog
          mode="edit"
          connection={editTarget}
          onSaved={() => { setEditTarget(null); refresh() }}
          onClose={() => setEditTarget(null)}
          forceOpen
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete connection?</DialogTitle>
            <DialogDescription>
              <strong>"{deleteTarget?.name}"</strong> will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── ConnectionFormDialog ──────────────────────────────────────────────────────

interface ConnectionFormDialogProps {
  mode: "create" | "edit"
  connection?: ConnectionMeta
  onSaved: () => void
  onClose?: () => void
  forceOpen?: boolean
}

function ConnectionFormDialog({ mode, connection, onSaved, onClose, forceOpen }: ConnectionFormDialogProps) {
  const [open, setOpen] = useState(forceOpen ?? false)
  const [input, setInput] = useState<ConnectionInput>(() =>
    mode === "edit" && connection
      ? {
          name: connection.name,
          driver: connection.driver || "mysql",
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: "",
          default_database: connection.default_database,
          read_only: connection.read_only,
          transaction_mode: (connection.transaction_mode as TransactionMode) || "auto_commit",
          label: connection.label,
          label_color: connection.label_color,
          folder: connection.folder,
        }
      : emptyInput
  )
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }))
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) onClose?.()
  }

  async function test() {
    setTesting(true)
    try {
      const res = await api.testConnection(input)
      if (res.ok) toast.success(res.message)
      else toast.error("Connection failed", { description: res.message })
    } catch (e) {
      toast.error("Connection failed", { description: String(e) })
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    if (!input.name.trim()) { toast.error("Name is required"); return }
    setSaving(true)
    try {
      if (mode === "edit" && connection) {
        await api.updateConnection(connection.id, input)
        toast.success("Connection updated")
      } else {
        await api.createConnection(input)
        toast.success("Connection saved")
        setInput(emptyInput)
      }
      handleOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error("Could not save connection", { description: String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {mode === "create" && !forceOpen && (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1 rounded-md border bg-transparent px-3 text-xs transition-colors hover:bg-accent"
        >
          <Plus className="size-3.5" /> New
        </button>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Connection" : "New Connection"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Leave password blank to keep the existing one."
              : "Credentials are stored encrypted on disk."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Name">
                <Input value={input.name} onChange={(e) => set("name", e.target.value)} placeholder="Local dev" />
              </Field>
            </div>
            <Field label="Driver">
              <Select value={input.driver} onValueChange={(v) => set("driver", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="postgres" disabled>PostgreSQL (soon)</SelectItem>
                  <SelectItem value="sqlite" disabled>SQLite (soon)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Host">
                <Input value={input.host} onChange={(e) => set("host", e.target.value)} placeholder="127.0.0.1" />
              </Field>
            </div>
            <Field label="Port">
              <Input type="number" value={input.port} onChange={(e) => set("port", Number(e.target.value) || 0)} />
            </Field>
          </div>

          <Field label="Username">
            <Input value={input.username} onChange={(e) => set("username", e.target.value)} placeholder="root" />
          </Field>
          <Field label={mode === "edit" ? "Password (blank = keep existing)" : "Password"}>
            <Input type="password" value={input.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" />
          </Field>
          <Field label="Default database (optional)">
            <Input value={input.default_database} onChange={(e) => set("default_database", e.target.value)} placeholder="myapp" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Transaction mode">
              <Select value={input.transaction_mode} onValueChange={(v) => set("transaction_mode", v as TransactionMode)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_commit">Auto-commit</SelectItem>
                  <SelectItem value="explicit_commit">Explicit commit</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end justify-between pb-1">
              <Label htmlFor="ro" className="text-xs">Read-only</Label>
              <Switch id="ro" checked={input.read_only} onCheckedChange={(v) => set("read_only", v)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Folder (optional)">
              <Input value={input.folder} onChange={(e) => set("folder", e.target.value)} placeholder="Work, Personal…" />
            </Field>
            <Field label="Label (optional)">
              <Input value={input.label} onChange={(e) => set("label", e.target.value)} placeholder="production, local…" />
            </Field>
          </div>

          <Field label="Label color">
            <div className="flex gap-1.5">
              {LABEL_PRESETS.map((p) => (
                <button
                  key={p.color}
                  type="button"
                  title={p.name}
                  onClick={() => set("label_color", p.color)}
                  className={cn(
                    "size-5 rounded-full transition-transform hover:scale-110",
                    input.label_color === p.color && "ring-2 ring-offset-2 ring-offset-background ring-foreground"
                  )}
                  style={{ background: p.color }}
                />
              ))}
              {input.label_color && (
                <button
                  type="button"
                  onClick={() => set("label_color", "")}
                  className="text-muted-foreground ml-1 text-xs hover:text-foreground"
                >
                  clear
                </button>
              )}
            </div>
          </Field>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={test} disabled={testing}>
            {testing ? "Testing…" : "Test"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
