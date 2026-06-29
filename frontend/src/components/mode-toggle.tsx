import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useThemeSetting } from "@/lib/use-theme-setting"

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useThemeSetting()
  const isDark = resolvedTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title="Toggle theme"
    >
      <Sun className="size-4 scale-100 dark:scale-0" />
      <Moon className="absolute size-4 scale-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
