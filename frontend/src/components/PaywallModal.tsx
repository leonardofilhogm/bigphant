import { BrowserOpenURL } from "../../wailsjs/runtime/runtime"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface PaywallModalProps {
  open: boolean
  message: string
  checkoutUrl: string
  onEnterKey: () => void
  onClose: () => void
}

export function PaywallModal({
  open,
  message,
  checkoutUrl,
  onEnterKey,
  onClose,
}: PaywallModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Upgrade to Pro</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          <li>Unlimited saved connections</li>
          <li>Export results (CSV, JSON, SQL)</li>
          <li>Modify table structure, indexes, and keys</li>
          <li>AI features (when available)</li>
        </ul>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => {
              if (checkoutUrl) BrowserOpenURL(checkoutUrl)
            }}
          >
            Upgrade
          </Button>
          <Button className="w-full" variant="outline" onClick={onEnterKey}>
            Enter different key
          </Button>
          <Button className="w-full" variant="ghost" onClick={onClose}>
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
