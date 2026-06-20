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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/lib/api"
import { isPlanRequired, parseAppError } from "@/lib/errors"
import type { Charset, ServerCapabilities, ServerUser } from "@/lib/types"
import {
  isMySQLFamily,
  isPostgres,
  MaintDialogProps,
  MaintRow,
  UnsupportedState,
} from "./shared"

export function DatabaseCreator({
  open,
  onOpenChange,
  driver,
  canModifySchema,
  onPlanRequired,
  onSuccess,
}: MaintDialogProps) {
  const [caps, setCaps] = useState<ServerCapabilities | null>(null)
  const [charsets, setCharsets] = useState<Charset[]>([])
  const [users, setUsers] = useState<ServerUser[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [charset, setCharset] = useState("")
  const [collation, setCollation] = useState("")
  const [encoding, setEncoding] = useState("")
  const [owner, setOwner] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api
      .serverCapabilities()
      .then(async (c) => {
        setCaps(c)
        if (c.manage_databases) {
          const [cs, us] = await Promise.all([
            api.listCharsets(),
            isPostgres(driver) ? api.listUsers() : Promise.resolve([]),
          ])
          setCharsets(cs)
          setUsers(us)
          if (cs[0]) {
            setCharset(cs[0].name)
            setCollation(cs[0].default_collation)
            setEncoding(cs[0].name)
          }
        }
      })
      .catch((e) => toast.error(parseAppError(e).message))
      .finally(() => setLoading(false))
  }, [open, driver])

  const selectedCharset = charsets.find((c) => c.name === charset)

  async function handleCreate() {
    if (!canModifySchema) {
      onPlanRequired?.("Upgrade to Pro to create databases.")
      return
    }
    if (!name.trim()) {
      toast.error("Database name is required")
      return
    }
    setCreating(true)
    try {
      await api.createDatabase({
        name: name.trim(),
        charset: isMySQLFamily(driver) ? charset : "",
        collation: isMySQLFamily(driver) ? collation : "",
        encoding: isPostgres(driver) ? encoding : "",
        owner: isPostgres(driver) && owner !== "__default__" ? owner : "",
      })
      toast.success("Database created")
      setName("")
      setConfirmOpen(false)
      onOpenChange(false)
      onSuccess?.()
    } catch (e) {
      if (isPlanRequired(e)) onPlanRequired?.(parseAppError(e).message)
      else toast.error(parseAppError(e).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Database</DialogTitle>
            <DialogDescription>
              Create a new database on the connected server.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
          ) : !caps?.manage_databases ? (
            <UnsupportedState feature="Database creation" />
          ) : (
            <div className="grid gap-4">
              <MaintRow label="Name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 w-48"
                  placeholder="my_database"
                />
              </MaintRow>

              {isMySQLFamily(driver) && (
                <>
                  <MaintRow label="Charset">
                    <Select value={charset} onValueChange={(v) => {
                      setCharset(v)
                      const c = charsets.find((x) => x.name === v)
                      if (c?.default_collation) setCollation(c.default_collation)
                    }}>
                      <SelectTrigger className="h-8 w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {charsets.map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </MaintRow>
                  <MaintRow label="Collation">
                    <Select value={collation} onValueChange={setCollation}>
                      <SelectTrigger className="h-8 w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedCharset?.collations?.length
                          ? selectedCharset.collations
                          : [selectedCharset?.default_collation].filter(Boolean)
                        ).map((col) => (
                          <SelectItem key={col} value={col!}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </MaintRow>
                </>
              )}

              {isPostgres(driver) && (
                <>
                  <MaintRow label="Encoding">
                    <Select value={encoding} onValueChange={setEncoding}>
                      <SelectTrigger className="h-8 w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {charsets.map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </MaintRow>
                  <MaintRow label="Owner">
                    <Select value={owner} onValueChange={setOwner}>
                      <SelectTrigger className="h-8 w-48">
                        <SelectValue placeholder="Default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">Default</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.name} value={u.name}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </MaintRow>
                </>
              )}

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => setConfirmOpen(true)}>
                  Create
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create database?</DialogTitle>
            <DialogDescription>
              Create <strong>{name}</strong> on the server?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={creating} onClick={handleCreate}>
              {creating ? "Creating…" : "Create database"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
