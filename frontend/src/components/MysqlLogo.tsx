import { cn } from "@/lib/utils"
import lightLogo from "@/assets/images/mysql-light-logo.webp"
import darkLogo from "@/assets/images/mysql-dark-logo.webp"

// MySQL dolphin mark. Each asset bakes in its own background (white for light,
// near-black for dark), so we swap the whole image by theme rather than tint it.
export function MysqlLogo({ className }: { className?: string }) {
  return (
    <>
      <img src={lightLogo} alt="MySQL" className={cn("block dark:hidden", className)} />
      <img src={darkLogo} alt="MySQL" className={cn("hidden dark:block", className)} />
    </>
  )
}
