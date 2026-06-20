import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { isPlanRequired, parseAppError } from "@/lib/errors"
import type { Grant, ServerCapabilities, ServerUser } from "@/lib/types"
import { TABLE_PRIVILEGES } from "@/lib/types"
import {
  isMySQLFamily,
  isPostgres,
  MaintDialogProps,
  MaintRow,
  UnsupportedState,
} from "./shared"

export function UserManager({
  open,
  onOpenChange,
  driver,
  canModifySchema,
  onPlanRequired,
}: MaintDialogProps) {
  const [caps, setCaps] = useState<ServerCapabilities | null>(null)
  const [users, setUsers] = useState<ServerUser[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<ServerUser | null>(null)
  const [grants, setGrants] = useState<Grant[]>([])
  const [databases, setDatabases] = useState<string[]>([])
  const [grantDB, setGrantDB] = useState("")
  const [privChecks, setPrivChecks] = useState<Record<string, boolean>>({})
  const [newName, setNewName] = useState("")
  const [newHost, setNewHost] = useState("%")
  const [newPassword, setNewPassword] = useState("")
  const [newCanLogin, setNewCanLogin] = useState(true)
  const [newSuper, setNewSuper] = useState(false)
  const [creating, setCreating] = useState(false)
  const [dropTarget, setDropTarget] = useState<ServerUser | null>(null)
  const [dropping, setDropping] = useState(false)
  const [savingGrants, setSavingGrants] = useState(false)

  async function refreshUsers() {
    const list = await api.listUsers()
    setUsers(list)
  }

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([api.serverCapabilities(), api.listDatabases()])
      .then(([c, dbs]) => {
        setCaps(c)
        setDatabases(dbs)
        if (c.manage_users) return refreshUsers()
      })
      .catch((e) => toast.error(parseAppError(e).message))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!selected) {
      setGrants([])
      return
    }
    api
      .listGrants(selected.name, selected.host)
      .then(setGrants)
      .catch((e) => toast.error(parseAppError(e).message))
  }, [selected])

  useEffect(() => {
    if (!grantDB) {
      setPrivChecks({})
      return
    }
    const g = grants.find((x) => x.database === grantDB)
    const next: Record<string, boolean> = {}
    for (const p of TABLE_PRIVILEGES) {
      next[p] = g?.privileges?.includes(p) ?? false
    }
    setPrivChecks(next)
  }, [grantDB, grants])

  async function handleCreate() {
    if (!canModifySchema) {
      onPlanRequired?.("Upgrade to Pro to manage users.")
      return
    }
    if (!newName.trim()) {
      toast.error("Username is required")
      return
    }
    setCreating(true)
    try {
      await api.createUser({
        name: newName.trim(),
        host: isMySQLFamily(driver) ? newHost : "",
        password: newPassword,
        can_login: newCanLogin,
        is_superuser: newSuper,
      })
      toast.success("User created")
      setNewName("")
      setNewPassword("")
      await refreshUsers()
    } catch (e) {
      if (isPlanRequired(e)) onPlanRequired?.(parseAppError(e).message)
      else toast.error(parseAppError(e).message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDrop() {
    if (!dropTarget || !canModifySchema) return
    setDropping(true)
    try {
      await api.dropUser(dropTarget.name, dropTarget.host)
      toast.success("User dropped")
      if (selected?.name === dropTarget.name) setSelected(null)
      setDropTarget(null)
      await refreshUsers()
    } catch (e) {
      toast.error(parseAppError(e).message)
    } finally {
      setDropping(false)
    }
  }

  async function handleSaveGrants() {
    if (!selected || !grantDB || !canModifySchema) return
    const privileges = TABLE_PRIVILEGES.filter((p) => privChecks[p])
    if (privileges.length === 0) {
      toast.error("Select at least one privilege")
      return
    }
    setSavingGrants(true)
    try {
      await api.applyGrants({
        user: selected.name,
        host: selected.host,
        database: grantDB,
        schema: "public",
        privileges: [...privileges],
        revoke: false,
      })
      toast.success("Privileges updated")
      const updated = await api.listGrants(selected.name, selected.host)
      setGrants(updated)
    } catch (e) {
      toast.error(parseAppError(e).message)
    } finally {
      setSavingGrants(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Users &amp; Permissions</DialogTitle>
            <DialogDescription>
              Manage server logins and per-database privileges.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
          ) : !caps?.manage_users ? (
            <UnsupportedState feature="User management" />
          ) : (
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1">
              <div className="grid gap-3">
                <MaintRow label="Create user">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      placeholder="Username"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="h-8 w-36"
                    />
                    {isMySQLFamily(driver) && (
                      <Input
                        placeholder="Host"
                        value={newHost}
                        onChange={(e) => setNewHost(e.target.value)}
                        className="h-8 w-28"
                      />
                    )}
                    <Input
                      placeholder="Password (optional)"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-8 w-40"
                    />
                    <Button size="sm" disabled={creating} onClick={handleCreate}>
                      {creating ? "Creating…" : "Create"}
                    </Button>
                  </div>
                </MaintRow>
                {isPostgres(driver) && (
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={newCanLogin} onCheckedChange={setNewCanLogin} id="login" />
                      <Label htmlFor="login" className="text-xs">Can login</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={newSuper} onCheckedChange={setNewSuper} id="super" />
                      <Label htmlFor="super" className="text-xs">Superuser</Label>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="grid gap-2">
                <Label className="text-sm">Users</Label>
                <div className="max-h-32 overflow-y-auto rounded border">
                  {users.map((u) => (
                    <div
                      key={`${u.name}@${u.host}`}
                      className={`flex items-center justify-between border-b px-2 py-1.5 text-sm last:border-0 ${
                        selected?.name === u.name && selected?.host === u.host
                          ? "bg-muted"
                          : "hover:bg-muted/50 cursor-pointer"
                      }`}
                      onClick={() => setSelected(u)}
                    >
                      <span>
                        {u.name}
                        {isMySQLFamily(driver) && (
                          <span className="text-muted-foreground">@{u.host}</span>
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDropTarget(u)
                        }}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <p className="text-muted-foreground px-2 py-4 text-center text-xs">No users</p>
                  )}
                </div>
              </div>

              {selected && (
                <>
                  <Separator />
                  <div className="grid gap-3">
                    <MaintRow label="Database" hint="Grant privileges on">
                      <Select value={grantDB} onValueChange={setGrantDB}>
                        <SelectTrigger className="h-8 w-44">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {databases.map((db) => (
                            <SelectItem key={db} value={db}>
                              {db}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </MaintRow>
                    {grantDB && (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {TABLE_PRIVILEGES.map((p) => (
                          <label key={p} className="flex items-center gap-1.5 text-xs">
                            <Checkbox
                              checked={privChecks[p] ?? false}
                              onCheckedChange={(v) =>
                                setPrivChecks((prev) => ({ ...prev, [p]: !!v }))
                              }
                            />
                            {p}
                          </label>
                        ))}
                      </div>
                    )}
                    <Button
                      size="sm"
                      className="w-fit"
                      disabled={!grantDB || savingGrants}
                      onClick={handleSaveGrants}
                    >
                      {savingGrants ? "Saving…" : "Apply privileges"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!dropTarget} onOpenChange={(o) => !o && setDropTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Drop user?</DialogTitle>
            <DialogDescription>
              <strong>{dropTarget?.name}</strong>
              {isMySQLFamily(driver) && dropTarget?.host && (
                <>@{dropTarget.host}</>
              )}{" "}
              will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDropTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={dropping} onClick={handleDrop}>
              {dropping ? "Dropping…" : "Drop user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
