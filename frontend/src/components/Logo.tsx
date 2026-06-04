import { cn } from "@/lib/utils"
import bigphantLogo from "@/assets/images/bigphant-logo.png"

export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={bigphantLogo}
      alt="Bigphant"
      className={cn("object-contain", className)}
    />
  )
}
