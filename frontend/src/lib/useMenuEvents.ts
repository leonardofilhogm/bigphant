import { useEffect, useRef } from "react"

import { EventsOn } from "../../wailsjs/runtime/runtime"

/**
 * Subscribes to native-menu events emitted by the Go backend (see menu.go).
 * Each key is an event name (e.g. "menu:new-query"); the handler runs when the
 * matching menu item is clicked or its accelerator pressed.
 *
 * Pass `enabled` to scope a subscription to the visible view — background
 * (kept-alive but hidden) connections pass `false` so only the active workspace
 * responds. Handlers are read through a ref so passing a fresh object each
 * render doesn't re-subscribe.
 */
export function useMenuEvents(
  handlers: Record<string, (...data: any[]) => void>,
  enabled = true
) {
  const ref = useRef(handlers)
  ref.current = handlers
  // Re-subscribe only when the set of event names changes, not on every render.
  const names = Object.keys(handlers).sort().join(",")

  useEffect(() => {
    if (!enabled) return
    const offs = Object.keys(ref.current).map((event) =>
      EventsOn(event, (...data) => ref.current[event]?.(...data))
    )
    return () => offs.forEach((off) => off())
  }, [enabled, names])
}
