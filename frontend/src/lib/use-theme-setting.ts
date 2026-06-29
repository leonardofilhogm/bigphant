import { useTheme } from "next-themes"
import { useCallback } from "react"

import { api } from "@/lib/api"

// Wraps next-themes so any in-app theme change is also persisted to settings.json
// (best-effort). This keeps the canonical store and the native View ▸ Appearance
// radio in sync with the live theme; next-themes still drives the visual switch.
export function useThemeSetting() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  const setThemePersisted = useCallback(
    (next: string) => {
      setTheme(next)
      api.setTheme(next).catch(() => {})
    },
    [setTheme]
  )

  return { theme, resolvedTheme, setTheme: setThemePersisted }
}
