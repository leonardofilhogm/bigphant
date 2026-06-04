import { useCallback, useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { EventsOn, WindowToggleMaximise } from "../wailsjs/runtime/runtime"

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { ActivationScreen } from "@/components/ActivationScreen"
import { WelcomeScreen } from "@/components/WelcomeScreen"
import { CloseUpsellModal } from "@/components/CloseUpsellModal"
import { PaywallModal } from "@/components/PaywallModal"
import { ConnectionList } from "@/pages/ConnectionList"
import { Workspace } from "@/pages/Workspace"
import { useLicense } from "@/hooks/useLicense"
import { useMenuEvents } from "@/lib/useMenuEvents"
import { api } from "@/lib/api"
import type { AppSettings, ConnectionMeta } from "@/lib/types"

function App() {
  const { license, activated, loading, refresh } = useLicense()
  // Connections opened this session are kept mounted (keep-alive) so their tabs
  // and filters survive switching between them. Only Log out clears them and
  // returns to the connection list. The backend still has a single live pool —
  // switching re-opens the target — but the per-connection UI state is local.
  const [openConns, setOpenConns] = useState<ConnectionMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showActivation, setShowActivation] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsReady, setSettingsReady] = useState(false)
  const [closeUpsell, setCloseUpsell] = useState(false)
  const [paywall, setPaywall] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  })

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s)
        if (!s.onboarding_completed) setShowWelcome(true)
      })
      .catch(() => {})
      .finally(() => setSettingsReady(true))
  }, [])

  useEffect(() => {
    if (!loading && !activated) {
      setShowActivation(true)
    }
  }, [loading, activated])

  useEffect(() => {
    return EventsOn("license:close-upsell", () => setCloseUpsell(true))
  }, [])

  // macOS double-click-to-zoom. Wails' CSS drag regions move the frameless
  // window but don't inherit the native title-bar double-click behavior, so we
  // recreate it: a draggable area inherits `--wails-draggable: drag` while its
  // interactive children opt out with `no-drag`, so we only zoom when the
  // double-click lands on an actual drag region (and never on a button/select).
  useEffect(() => {
    function onDblClick(e: MouseEvent) {
      const el = e.target as HTMLElement | null
      if (!el) return
      const draggable = getComputedStyle(el).getPropertyValue("--wails-draggable").trim()
      if (draggable === "drag") WindowToggleMaximise()
    }
    document.addEventListener("dblclick", onDblClick)
    return () => document.removeEventListener("dblclick", onDblClick)
  }, [])

  const onPlanRequired = useCallback((message: string) => {
    setPaywall({ open: true, message })
  }, [])

  // Open a connection (from the list) or switch to one (from the workspace
  // switcher). Adds it to the kept-alive set if new, then makes it active. The
  // backend pool is opened by the caller before this runs.
  const activateConnection = useCallback((c: ConnectionMeta) => {
    setOpenConns((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]))
    setActiveId(c.id)
  }, [])

  // Log out: drop all kept-alive workspaces and return to the connection list.
  const logout = useCallback(() => {
    setOpenConns([])
    setActiveId(null)
  }, [])

  // Persist a theme chosen from the View ▸ Appearance menu so the native radio
  // reflects it on next launch (the visual switch is done by next-themes).
  const persistTheme = useCallback((theme: string) => {
    setSettings((prev) => {
      const next: AppSettings = {
        ...(prev ?? {
          allow_destructive_without_where: false,
          default_transaction_mode: "auto_commit",
          theme,
          onboarding_completed: false,
        }),
        theme,
      }
      api.updateSettings(next).catch(() => {})
      return next
    })
  }, [])

  const completeOnboarding = useCallback(async () => {
    setShowWelcome(false)
    const next = settings
      ? { ...settings, onboarding_completed: true }
      : {
          allow_destructive_without_where: false,
          default_transaction_mode: "auto_commit",
          theme: "system",
          onboarding_completed: true,
        }
    setSettings(next)
    try {
      await api.updateSettings(next)
    } catch {
      /* best-effort */
    }
  }, [settings])

  const openActivation = useCallback(() => {
    setShowActivation(true)
  }, [])

  const handleLicenseSignOut = useCallback(() => {
    logout()
    refresh()
    setShowActivation(true)
  }, [refresh, logout])

  const bootLoading = loading || !settingsReady

  if (bootLoading) {
    return (
      <ThemeProvider>
        <TitleBarDragStrip />
        <div className="bg-background flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      </ThemeProvider>
    )
  }

  if (showWelcome) {
    return (
      <ThemeProvider>
        <TitleBarDragStrip />
        <WelcomeScreen onDone={completeOnboarding} />
        <Toaster position="bottom-right" />
      </ThemeProvider>
    )
  }

  if (showActivation || !activated) {
    return (
      <ThemeProvider>
        <TitleBarDragStrip />
        <ActivationScreen
          onActivated={() => {
            setShowActivation(false)
            refresh()
          }}
          onCancel={activated ? () => setShowActivation(false) : undefined}
        />
        <Toaster position="bottom-right" />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <AppMenuBridge
        onLogout={logout}
        onThemeChange={persistTheme}
        onAbout={() => toast("Bigphant", { description: "Version 0.1.0" })}
      />
      {openConns.length > 0 ? (
        // Every opened connection stays mounted; inactive ones are hidden (not
        // unmounted) so their tabs/filters persist until Log out.
        openConns.map((c) => (
          <div key={c.id} style={{ display: c.id === activeId ? "contents" : "none" }}>
            <Workspace
              connection={c}
              isActive={c.id === activeId}
              license={license}
              onPlanRequired={onPlanRequired}
              onClose={logout}
              onSwitch={activateConnection}
              onManageLicense={openActivation}
              onReplayWelcome={() => setShowWelcome(true)}
              onLicenseSignOut={handleLicenseSignOut}
            />
          </div>
        ))
      ) : (
        <ConnectionList
          license={license}
          onPlanRequired={onPlanRequired}
          onOpen={activateConnection}
          onManageLicense={openActivation}
          onLicenseSignOut={handleLicenseSignOut}
        />
      )}

      <PaywallModal
        open={paywall.open}
        message={paywall.message}
        checkoutUrl={license?.checkout_url ?? ""}
        onEnterKey={() => {
          setPaywall({ open: false, message: "" })
          openActivation()
        }}
        onClose={() => setPaywall({ open: false, message: "" })}
      />

      <CloseUpsellModal open={closeUpsell} checkoutUrl={license?.checkout_url ?? ""} />

      <Toaster position="bottom-right" />
    </ThemeProvider>
  )
}

export default App

// Invisible draggable strip pinned to the top of full-screen views that have
// no header of their own (loading, welcome, activation). On the frameless
// macOS window this is what lets the user drag the window by the title-bar
// area. Sized to the standard title-bar height so it doesn't cover content.
function TitleBarDragStrip() {
  return <div className="titlebar-drag fixed inset-x-0 top-0 z-50 h-7" />
}

// Handles app-level menu events that need theme context (must live inside
// ThemeProvider, which App itself renders). Workspace-scoped menu events are
// handled in Workspace/TableView so only the active connection responds.
function AppMenuBridge({
  onLogout,
  onThemeChange,
  onAbout,
}: {
  onLogout: () => void
  onThemeChange: (theme: string) => void
  onAbout: () => void
}) {
  const { setTheme } = useTheme()
  useMenuEvents({
    "menu:theme": (theme: string) => {
      setTheme(theme)
      onThemeChange(theme)
    },
    "menu:logout": onLogout,
    "menu:about": onAbout,
  })
  return null
}

// Re-export for child components that catch API errors
export type PlanRequiredHandler = (message: string) => void
