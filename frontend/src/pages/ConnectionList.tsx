import { useEffect, useState } from "react"
import { ChevronRight, FileText, FolderOpen, Lock, Pencil, Plus, Server, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
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
import { DriverLogo } from "@/components/DriverLogo"
import { LicensePanel } from "@/components/LicensePanel"
import { cn } from "@/lib/utils"
import { useMenuEvents } from "@/lib/useMenuEvents"
import { api } from "@/lib/api"
import { isPlanRequired, parseAppError } from "@/lib/errors"
import type { LicenseInfo } from "@/lib/license-types"
import type { ConnectionInput, ConnectionMeta, TransactionMode } from "@/lib/types"

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
  file_path: "",
  default_database: "",
  sslmode: "prefer",
  read_only: false,
  transaction_mode: "auto_commit",
  edit_mode: "",
  label: "",
  label_color: "",
  folder: "",
  ssh_enabled: false,
  ssh_host: "",
  ssh_port: 22,
  ssh_username: "",
  ssh_auth_method: "password",
  ssh_password: "",
  ssh_key_path: "",
  ssh_private_key: "",
  ssh_passphrase: "",
}

// ── ConnectionList ────────────────────────────────────────────────────────────

interface ConnectionListProps {
  license: LicenseInfo | null
  onPlanRequired: (message: string) => void
  onManageLicense: () => void
  onLicenseSignOut: () => void
  onOpen: (connection: ConnectionMeta) => void
}

export function ConnectionList({
  license,
  onPlanRequired,
  onManageLicense,
  onLicenseSignOut,
  onOpen,
}: ConnectionListProps) {
  const [licenseOpen, setLicenseOpen] = useState(false)
  const [connections, setConnections] = useState<ConnectionMeta[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [editTarget, setEditTarget] = useState<ConnectionMeta | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ConnectionMeta | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)

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

  // Native-menu actions available on the connection-list screen (no workspace
  // open). This page only mounts when visible, so no scoping flag is needed.
  useMenuEvents({
    "menu:new-connection": () => setCreateOpen(true),
    "menu:license": () => setLicenseOpen(true),
  })

  async function open(connection: ConnectionMeta) {
    setOpening(true)
    try {
      await api.openConnection(connection.id)
      onOpen(connection)
    } catch (e) {
      const { code, message } = parseAppError(e)
      if (code === "PlanRequired") onPlanRequired(message)
      else toast.error("Could not open connection", { description: message })
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
      <header className="titlebar-drag titlebar-inset flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <img
            src="/favicon.png"
            alt="Bigphant"
            className="size-7 rounded-md object-contain"
            style={{ background: "#FDE3EA" }}
          />
          <span className="font-brand text-base font-semibold">Bigphant</span>
        </div>
        <div className="flex items-center gap-2">
          {license && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setLicenseOpen(true)}
            >
              License
              <Badge
                variant={license.plan === "pro" ? "default" : "secondary"}
                className="h-4 px-1.5 text-[10px]"
              >
                {license.plan === "pro" ? "Pro" : "Free"}
              </Badge>
            </Button>
          )}
          <ModeToggle />
        </div>
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
              {license && license.max_connections > 0 && (
                <p className="text-muted-foreground text-[10px]">
                  {license.connection_count} / {license.max_connections} connections (Free)
                </p>
              )}
            </div>
            <ConnectionFormDialog mode="create" onSaved={refresh} onPlanRequired={onPlanRequired} />
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
                              c.locked && "opacity-50",
                              selected === c.id ? "bg-accent" : "hover:bg-accent/50"
                            )}
                          >
                            <DriverLogo driver={c.driver} className="size-9 shrink-0 rounded-lg object-contain" />
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
                                {c.locked && (
                                  <Badge variant="outline" className="h-4 gap-1 px-1.5 text-[10px]">
                                    <Lock className="size-2.5" /> Pro
                                  </Badge>
                                )}
                                {c.read_only && (
                                  <Badge variant="secondary" className="h-4 gap-1 px-1.5 text-[10px]">
                                    <Lock className="size-2.5" /> read-only
                                  </Badge>
                                )}
                              </div>
                              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                                {c.driver === "sqlite" ? (
                                  <>
                                    <FileText className="size-3 shrink-0" />
                                    <span className="truncate" dir="rtl" title={c.file_path}>
                                      {c.file_path}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Server className="size-3" />
                                    <span className="truncate">
                                      {c.username}@{c.host}:{c.port}
                                      {c.default_database && `/${c.default_database}`}
                                    </span>
                                  </>
                                )}
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

      {createOpen && (
        <ConnectionFormDialog
          mode="create"
          forceOpen
          onPlanRequired={onPlanRequired}
          onSaved={() => { setCreateOpen(false); refresh() }}
          onClose={() => setCreateOpen(false)}
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

      <Dialog open={licenseOpen} onOpenChange={setLicenseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>License</DialogTitle>
            <DialogDescription>View your plan, devices, and manage activation.</DialogDescription>
          </DialogHeader>
          <LicensePanel
            onChangeLicense={() => {
              setLicenseOpen(false)
              onManageLicense()
            }}
            onSignOut={() => {
              setLicenseOpen(false)
              onLicenseSignOut()
            }}
          />
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
  onPlanRequired?: (message: string) => void
  onClose?: () => void
  forceOpen?: boolean
}

export function ConnectionFormDialog({
  mode,
  connection,
  onSaved,
  onPlanRequired,
  onClose,
  forceOpen,
}: ConnectionFormDialogProps) {
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
          file_path: connection.file_path || "",
          default_database: connection.default_database,
          sslmode: connection.sslmode || "prefer",
          read_only: connection.read_only,
          transaction_mode: (connection.transaction_mode as TransactionMode) || "auto_commit",
          edit_mode: connection.edit_mode || "",
          label: connection.label,
          label_color: connection.label_color,
          folder: connection.folder,
          // SSH secrets are never sent back, so they init blank and a blank
          // value on save preserves whatever is stored (see store.Update).
          ssh_enabled: connection.ssh_enabled,
          ssh_host: connection.ssh_host,
          ssh_port: connection.ssh_port || 22,
          ssh_username: connection.ssh_username,
          ssh_auth_method: connection.ssh_auth_method || "password",
          ssh_key_path: connection.ssh_key_path,
          ssh_password: "",
          ssh_private_key: "",
          ssh_passphrase: "",
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

  async function handlePickFile() {
    try {
      const path = await api.pickSQLiteFile()
      if (path) {
        setInput((prev) => ({
          ...prev,
          file_path: path,
          // Default the connection name to the file name when it is still blank.
          name: prev.name.trim() ? prev.name : path.replace(/^.*\//, ""),
        }))
      }
    } catch (e) {
      toast.error("Could not open file picker", { description: String(e) })
    }
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
      const { message } = parseAppError(e)
      if (isPlanRequired(e) && onPlanRequired) onPlanRequired(message)
      else toast.error("Could not save connection", { description: message })
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
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Connection" : "New Connection"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Leave password blank to keep the existing one."
              : "Credentials are stored encrypted on disk."}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 grid min-h-0 flex-1 gap-3 overflow-y-auto px-1 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Name">
                <Input value={input.name} onChange={(e) => set("name", e.target.value)} placeholder="Local dev" />
              </Field>
            </div>
            <Field label="Driver">
              <Select
                value={input.driver}
                onValueChange={(v) => {
                  set("driver", v)
                  if (v === "postgres") set("port", 5432 as any)
                  if (v === "mysql" || v === "mariadb") set("port", 3306 as any)
                  if (v === "sqlite") set("ssh_enabled", false)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="mariadb">MariaDB</SelectItem>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                  <SelectItem value="sqlite">SQLite</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {input.driver === "sqlite" ? (
            <Field label="Database file">
              <div className="flex gap-2">
                <Input
                  value={input.file_path}
                  onChange={(e) => set("file_path", e.target.value)}
                  placeholder="/Users/you/data/app.db"
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={handlePickFile}>
                  Browse…
                </Button>
              </div>
            </Field>
          ) : (
            <>
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

              {input.driver === "postgres" && (
                <Field label="SSL mode">
                  <Select value={input.sslmode} onValueChange={(v) => set("sslmode", v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disable">disable</SelectItem>
                      <SelectItem value="prefer">prefer</SelectItem>
                      <SelectItem value="require">require</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </>
          )}

          {input.driver !== "sqlite" && (
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="ssh" className="text-xs font-medium">
                SSH tunnel
              </Label>
              <Switch
                id="ssh"
                checked={input.ssh_enabled}
                onCheckedChange={(v) => set("ssh_enabled", v)}
              />
            </div>

            {input.ssh_enabled && (
              <div className="mt-3 grid gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Field label="SSH host">
                      <Input
                        value={input.ssh_host}
                        onChange={(e) => set("ssh_host", e.target.value)}
                        placeholder="bastion.example.com"
                      />
                    </Field>
                  </div>
                  <Field label="SSH port">
                    <Input
                      type="number"
                      value={input.ssh_port}
                      onChange={(e) => set("ssh_port", Number(e.target.value) || 0)}
                    />
                  </Field>
                </div>

                <Field label="SSH username">
                  <Input
                    value={input.ssh_username}
                    onChange={(e) => set("ssh_username", e.target.value)}
                    placeholder="ec2-user"
                  />
                </Field>

                <Field label="Authentication">
                  <Select
                    value={input.ssh_auth_method}
                    onValueChange={(v) => set("ssh_auth_method", v)}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="password">Password</SelectItem>
                      <SelectItem value="key">Private key</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                {input.ssh_auth_method === "key" ? (
                  <>
                    <Field label="Private key file path">
                      <Input
                        value={input.ssh_key_path}
                        onChange={(e) => set("ssh_key_path", e.target.value)}
                        placeholder="~/.ssh/id_ed25519"
                        className="font-mono text-xs"
                      />
                    </Field>
                    <Field
                      label={
                        mode === "edit"
                          ? "…or paste private key (blank = keep existing)"
                          : "…or paste private key (PEM)"
                      }
                    >
                      <Textarea
                        value={input.ssh_private_key}
                        onChange={(e) => set("ssh_private_key", e.target.value)}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        disabled={!!input.ssh_key_path.trim()}
                        className="h-24 font-mono text-xs"
                      />
                    </Field>
                    <Field label="Key passphrase (optional)">
                      <Input
                        type="password"
                        value={input.ssh_passphrase}
                        onChange={(e) => set("ssh_passphrase", e.target.value)}
                        placeholder="••••••••"
                      />
                    </Field>
                  </>
                ) : (
                  <Field
                    label={
                      mode === "edit"
                        ? "SSH password (blank = keep existing)"
                        : "SSH password"
                    }
                  >
                    <Input
                      type="password"
                      value={input.ssh_password}
                      onChange={(e) => set("ssh_password", e.target.value)}
                      placeholder="••••••••"
                    />
                  </Field>
                )}
              </div>
            )}
          </div>
          )}

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
