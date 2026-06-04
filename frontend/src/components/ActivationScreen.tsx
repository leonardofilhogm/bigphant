import { useState } from "react"
import { KeyRound, Mail } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Logo } from "@/components/Logo"
import { api } from "@/lib/api"
import { parseAppError } from "@/lib/errors"
import type { LicenseDevice } from "@/lib/license-types"

interface ActivationScreenProps {
  onActivated: () => void
  onCancel?: () => void
}

export function ActivationScreen({ onActivated, onCancel }: ActivationScreenProps) {
  const [key, setKey] = useState("")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [freeSent, setFreeSent] = useState(false)
  const [devices, setDevices] = useState<LicenseDevice[] | null>(null)

  async function activate(licenseKey: string) {
    setBusy(true)
    setDevices(null)
    try {
      await api.activateLicense(licenseKey.trim())
      toast.success("License activated")
      onActivated()
    } catch (e) {
      const { code, message } = parseAppError(e)
      if (code === "DeviceLimitReached") {
        try {
          const list = await api.listLicenseDevices()
          setDevices(list)
        } catch {
          /* ignore */
        }
        toast.error("Device limit reached", { description: message })
      } else {
        toast.error("Activation failed", { description: message })
      }
    } finally {
      setBusy(false)
    }
  }

  async function requestFree() {
    setBusy(true)
    try {
      await api.requestFreeLicense(email.trim())
      setFreeSent(true)
      toast.success("Check your email for a Free license key")
    } catch (e) {
      const { message } = parseAppError(e)
      toast.error("Registration failed", { description: message })
    } finally {
      setBusy(false)
    }
  }

  async function deactivateAndRetry(deviceId: string) {
    setBusy(true)
    try {
      await api.deactivateLicenseDevice(deviceId)
      await activate(key)
    } catch (e) {
      toast.error("Could not deactivate device", { description: String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo className="h-10" />
          <h1 className="text-xl font-semibold">Activate Bigphant</h1>
          <p className="text-muted-foreground text-sm">
            A license key is required. Register for Free or enter a Pro key.
          </p>
        </div>

        <Tabs defaultValue="key" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="key">
              <KeyRound className="mr-1.5 size-3.5" /> Enter key
            </TabsTrigger>
            <TabsTrigger value="free">
              <Mail className="mr-1.5 size-3.5" /> Get Free key
            </TabsTrigger>
          </TabsList>

          <TabsContent value="key" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="license-key">License key</Label>
              <Input
                id="license-key"
                placeholder="BP-FREE-XXXXX-XXXXX-XXXXX-XXXXX"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoCapitalize="characters"
              />
            </div>
            <Button className="w-full" disabled={!key.trim() || busy} onClick={() => activate(key)}>
              Activate
            </Button>
          </TabsContent>

          <TabsContent value="free" className="space-y-4 pt-4">
            {freeSent ? (
              <p className="text-muted-foreground text-sm">
                If registration succeeded, check your email for your key and paste it in the Enter
                key tab.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Button className="w-full" disabled={!email.trim() || busy} onClick={requestFree}>
                  Send Free key
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>

        {onCancel && (
          <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onCancel}>
            Back to app
          </Button>
        )}

        {devices && devices.length > 0 && (
          <div className="border-border space-y-2 rounded-lg border p-4">
            <p className="text-sm font-medium">Deactivate a device to continue</p>
            <ul className="space-y-2">
              {devices.map((d) => (
                <li key={d.device_id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {d.name} <span className="text-muted-foreground">({d.platform})</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => deactivateAndRetry(d.device_id)}
                  >
                    Deactivate
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
