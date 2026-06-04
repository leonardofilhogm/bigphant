import { cn } from "@/lib/utils"
import lightLogo from "@/assets/images/postgres-light-logo.png"
import darkLogo from "@/assets/images/postgres-dark-logo.png"

// PostgreSQL elephant mark. Blue-on-light asset for light UI; white-on-blue for dark UI.
// (Asset filenames refer to mark color, not which theme they target.)
export function PostgresLogo({ className }: { className?: string }) {
  return (
    <>
      <img src={darkLogo} alt="PostgreSQL" className={cn("block dark:hidden", className)} />
      <img src={lightLogo} alt="PostgreSQL" className={cn("hidden dark:block", className)} />
    </>
  )
}
