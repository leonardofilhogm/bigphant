package main

import (
	"context"
	"embed"

	"bigphant/internal/license"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "Bigphant",
		Width:     1280,
		Height:    800,
		MinWidth:  960,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 1},
		Menu:             app.buildMenu(),
		// Full-size content window: the webview extends up under the title-bar
		// strip and the traffic-light buttons are inset over our own top bar
		// (TablePlus-style). The top bars in the frontend reserve space for the
		// traffic lights and are marked --wails-draggable so the window can
		// still be moved by dragging them.
		Mac: &mac.Options{
			TitleBar:   mac.TitleBarHiddenInset(),
			Appearance: mac.DefaultAppearance, // follow system light/dark
		},
		OnStartup: app.startup,
		OnShutdown:       app.shutdown,
		OnBeforeClose: func(ctx context.Context) bool {
			if app.ShouldInterceptClose() {
				license.SetPendingCloseUpsell(true)
				runtime.EventsEmit(ctx, "license:close-upsell")
				return true
			}
			return false
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
