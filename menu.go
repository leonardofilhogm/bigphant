package main

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// buildMenu constructs the native macOS menu bar.
//
// Application-specific items emit `menu:*` events that the frontend listens for
// (see frontend/src/lib/useMenuEvents.ts) and routes to the active connection's
// workspace. Standard items use Wails' built-in EditMenu/WindowMenu so native
// Cut/Copy/Paste/Undo and window controls work inside the webview — without an
// Edit menu, those accelerators are unreliable in a WebKit view on macOS.
//
// Accelerators here are the single source of truth for app-global actions; the
// matching JS keyboard bindings were removed to avoid double-firing. Editor- or
// focus-local shortcuts (⌘↵ run SQL, ⌘1–9 tabs, ⌘Z discard) stay in the
// frontend.
func (a *App) buildMenu() *menu.Menu {
	emit := func(event string) menu.Callback {
		return func(*menu.CallbackData) { runtime.EventsEmit(a.ctx, event) }
	}
	emitData := func(event string, data ...interface{}) menu.Callback {
		return func(*menu.CallbackData) { runtime.EventsEmit(a.ctx, event, data...) }
	}

	m := menu.NewMenu()

	// ── Bigphant (the first submenu becomes the macOS application menu) ──────
	app := m.AddSubmenu("Bigphant")
	app.AddText("About Bigphant", nil, emit("menu:about"))
	app.AddSeparator()
	app.AddText("Settings…", keys.CmdOrCtrl(","), emit("menu:settings"))
	app.AddText("Manage License…", nil, emit("menu:license"))
	app.AddSeparator()
	app.AddText("Hide Bigphant", keys.CmdOrCtrl("h"), func(*menu.CallbackData) { runtime.Hide(a.ctx) })
	app.AddText("Quit Bigphant", keys.CmdOrCtrl("q"), func(*menu.CallbackData) { runtime.Quit(a.ctx) })

	// ── File ────────────────────────────────────────────────────────────────
	file := m.AddSubmenu("File")
	file.AddText("New Query", keys.CmdOrCtrl("t"), emit("menu:new-query"))
	file.AddText("New Connection…", keys.CmdOrCtrl("n"), emit("menu:new-connection"))
	file.AddSeparator()
	file.AddText("Close Tab", keys.CmdOrCtrl("w"), emit("menu:close-tab"))
	file.AddText("Close All Tabs", keys.Combo("w", keys.CmdOrCtrlKey, keys.ShiftKey), emit("menu:close-all-tabs"))

	// ── Edit (native Undo/Redo/Cut/Copy/Paste/Select All) ───────────────────
	m.Append(menu.EditMenu())

	// ── View ────────────────────────────────────────────────────────────────
	view := m.AddSubmenu("View")
	view.AddText("Toggle Sidebar", keys.CmdOrCtrl("b"), emit("menu:toggle-sidebar"))
	view.AddSeparator()
	view.AddText("Refresh Data", keys.CmdOrCtrl("r"), emit("menu:refresh"))
	view.AddText("Toggle Filters", keys.CmdOrCtrl("f"), emit("menu:toggle-filters"))
	view.AddSeparator()
	appearance := view.AddSubmenu("Appearance")
	theme := a.settings.Theme
	if theme == "" {
		theme = "system"
	}
	appearance.AddRadio("Light", theme == "light", nil, emitData("menu:theme", "light"))
	appearance.AddRadio("Dark", theme == "dark", nil, emitData("menu:theme", "dark"))
	appearance.AddRadio("System", theme == "system", nil, emitData("menu:theme", "system"))

	// ── Connections ─────────────────────────────────────────────────────────
	conns := m.AddSubmenu("Connections")
	conns.AddText("Switch Connection…", keys.CmdOrCtrl("k"), emit("menu:switch-connection"))
	conns.AddSeparator()
	conns.AddText("Log Out", nil, emit("menu:logout"))

	// ── Maintenance ───────────────────────────────────────────────────────────
	maint := m.AddSubmenu("Maintenance")
	maint.AddText("Manage Users & Permissions…", nil, emit("menu:maint-users"))
	maint.AddText("Create Database…", nil, emit("menu:maint-database"))
	maint.AddText("Server Activity…", nil, emit("menu:maint-activity"))
	maint.AddText("Database Maintenance…", nil, emit("menu:maint-tools"))

	// ── Window (native Minimize/Zoom/Fullscreen) ────────────────────────────
	m.Append(menu.WindowMenu())

	return m
}
