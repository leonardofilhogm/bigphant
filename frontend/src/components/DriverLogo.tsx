import { MysqlLogo } from "@/components/MysqlLogo"
import { PostgresLogo } from "@/components/PostgresLogo"
import { cn } from "@/lib/utils"

const DRIVER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  mariadb: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-400", label: "Mb" },
  sqlite: { bg: "bg-teal-100 dark:bg-teal-900/40", text: "text-teal-600 dark:text-teal-400", label: "Sq" },
}

interface DriverLogoProps {
  driver: string
  className?: string
}

/** Engine logo for connection list and workspace chrome. */
export function DriverLogo({ driver, className }: DriverLogoProps) {
  if (driver === "postgres") {
    return <PostgresLogo className={className} />
  }
  if (driver === "mysql" || driver === "" || driver === "mariadb") {
    return <MysqlLogo className={className} />
  }

  const style = DRIVER_STYLES[driver] ?? {
    bg: "bg-muted",
    text: "text-muted-foreground",
    label: "DB",
  }
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
        style.bg,
        style.text,
        className
      )}
    >
      {style.label}
    </div>
  )
}
