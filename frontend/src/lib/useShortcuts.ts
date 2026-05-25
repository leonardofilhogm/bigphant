import { useEffect, useRef } from "react"

export interface Shortcut {
  /** Match KeyboardEvent.key (case-insensitive), e.g. "t", "Enter", "ArrowRight". */
  key?: string
  /** Match KeyboardEvent.code, e.g. "BracketLeft". Use for keys whose `key`
   *  value shifts with modifiers (brackets, digits). */
  code?: string
  meta?: boolean
  shift?: boolean
  alt?: boolean
  ctrl?: boolean
  /** Fire even when focus is in a text field. Defaults to true — every binding
   *  here uses ⌘, so it won't collide with normal typing. */
  allowInInput?: boolean
  handler: (e: KeyboardEvent) => void
}

const FIELD = /^(input|textarea|select)$/i

function inField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable || FIELD.test(el.tagName)) return true
  return !!el.closest?.(".cm-editor") // CodeMirror
}

/**
 * Registers window-level keyboard shortcuts (macOS app — ⌘ is `metaKey`).
 * Handlers are read through a ref so passing a fresh array each render does not
 * re-subscribe the listener. Pass `enabled` to scope a binding to the visible
 * tab so background (mounted-but-hidden) views don't also react.
 */
export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  const ref = useRef(shortcuts)
  ref.current = shortcuts

  useEffect(() => {
    if (!enabled) return
    function onKey(e: KeyboardEvent) {
      for (const s of ref.current) {
        if (!s.key && !s.code) continue
        if (s.key && e.key.toLowerCase() !== s.key.toLowerCase()) continue
        if (s.code && e.code !== s.code) continue
        if (!!s.meta !== e.metaKey) continue
        if (!!s.ctrl !== e.ctrlKey) continue
        if (!!s.shift !== e.shiftKey) continue
        if (!!s.alt !== e.altKey) continue
        if (s.allowInInput === false && inField(e.target)) continue
        e.preventDefault()
        s.handler(e)
        return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [enabled])
}
