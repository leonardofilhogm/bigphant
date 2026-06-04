import { BrowserOpenURL, Quit } from "../../wailsjs/runtime/runtime"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"

interface CloseUpsellModalProps {
  open: boolean
  checkoutUrl: string
}

export function CloseUpsellModal({ open, checkoutUrl }: CloseUpsellModalProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Enjoying Bigphant?</DialogTitle>
          <DialogDescription>
            You&apos;re on the Free plan. Upgrade to Pro to unlock unlimited connections, export,
            and schema editing.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            onClick={() => {
              if (checkoutUrl) BrowserOpenURL(checkoutUrl)
            }}
          >
            Upgrade
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await api.confirmQuitClose()
              Quit()
            }}
          >
            Quit Bigphant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
