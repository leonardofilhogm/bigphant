import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import type { LicenseDevice, LicenseInfo } from "@/lib/license-types"

interface LicensePanelProps {
  onChangeLicense?: () => void
  onSignOut: () => void
}

export function LicensePanel({ onChangeLicense, onSignOut }: LicensePanelProps) {
  const [license, setLicense] = useState<LicenseInfo | null>(null)
  const [devices, setDevices] = useState<LicenseDevice[]>([])
  const [checking, setChecking] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function load() {
    const info = await api.getLicense()
    setLicense(info)
    try {
      setDevices(await api.listLicenseDevices())
    } catch {
      setDevices([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function removeLicense() {
    setRemoving(true)
    try {
      let deactivated = true
      try {
        await api.deactivateThisDevice()
      } catch {
        // Deactivation frees a device seat on the server, but it must never block
        // the user from removing their own license. Fall back to a local clear.
        deactivated = false
        await api.removeLicense()
      }
      if (!deactivated) {
        toast.message("License removed locally", {
          description: "Couldn't deactivate on the license server; this device was cleared locally.",
        })
      }
      setConfirmRemove(false)
      onSignOut()
    } catch (e) {
      toast.error("Could not remove license", { description: String(e) })
    } finally {
      setRemoving(false)
    }
  }

  if (!license) return null

  const lastVal = license.last_validated_at
    ? new Date(license.last_validated_at * 1000).toLocaleString()
    : "Never"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>License</Label>
        <Badge variant={license.plan === "pro" ? "default" : "secondary"}>
          {license.plan === "pro" ? "Pro" : "Free"}
        </Badge>
      </div>
      {license.email && (
        <p className="text-muted-foreground text-sm">{license.email}</p>
      )}
      {license.key_masked && (
        <p className="font-mono text-xs">{license.key_masked}</p>
      )}
      <p className="text-muted-foreground text-xs">
        Connections: {license.connection_count}
        {license.max_connections > 0 ? ` / ${license.max_connections}` : " (unlimited)"}
      </p>
      <p className="text-muted-foreground text-xs">Last validated: {lastVal}</p>
      <Button
        size="sm"
        variant="outline"
        disabled={checking}
        onClick={async () => {
          setChecking(true)
          try {
            await api.forceValidateLicense()
            await load()
            toast.success("License validated")
          } catch (e) {
            toast.error(String(e))
          } finally {
            setChecking(false)
          }
        }}
      >
        Check now
      </Button>

      {devices.length > 0 && (
        <>
          <Separator />
          <Label className="text-sm">Devices on this license</Label>
          <ul className="text-muted-foreground space-y-1 text-xs">
            {devices.map((d) => (
              <li key={d.device_id}>
                {d.name} ({d.platform})
                {d.device_id === license.device_id && " — this device"}
              </li>
            ))}
          </ul>
        </>
      )}

      <Separator />
      <div className="flex flex-col gap-2">
        {onChangeLicense && (
          <Button size="sm" variant="outline" onClick={onChangeLicense}>
            Change license
          </Button>
        )}
        <Button size="sm" variant="destructive" onClick={() => setConfirmRemove(true)}>
          Remove license
        </Button>
      </div>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove license?</DialogTitle>
            <DialogDescription>
              This deactivates this device and clears your local license. You will need your key
              again to use Bigphant.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={removing} onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={removing} onClick={removeLicense}>
              Remove license
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
