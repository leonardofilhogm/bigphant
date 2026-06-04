package main

import (
	"sort"

	"bigphant/internal/apperror"
	"bigphant/internal/license"
)

// LicenseInfo is exposed to the frontend via Wails.
type LicenseInfo = license.Info

// LicenseDevice is exposed to the frontend via Wails.
type LicenseDevice = license.Device

func (a *App) licenseConnectionCount() int {
	if a.store == nil {
		return 0
	}
	list, err := a.store.List()
	if err != nil {
		return 0
	}
	return len(list)
}

func (a *App) orderedConnectionIDs() []string {
	if a.store == nil {
		return nil
	}
	list, err := a.store.List()
	if err != nil {
		return nil
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt.Before(list[j].CreatedAt)
	})
	ids := make([]string, len(list))
	for i, m := range list {
		ids[i] = m.ID
	}
	return ids
}

func (a *App) requireLicense() error {
	if a.licenseSvc == nil || !a.licenseSvc.Activated() {
		return apperror.LicenseRequired()
	}
	return nil
}

func (a *App) requireWrite() error {
	if err := a.requireLicense(); err != nil {
		return err
	}
	info := a.licenseSvc.Info(a.licenseConnectionCount())
	if !info.CanWrite {
		return apperror.LicenseReadOnly()
	}
	return nil
}

func (a *App) gateLicense(err error) error {
	return apperror.FromLicense(err)
}

// GetLicense returns the current license state for the UI.
func (a *App) GetLicense() (LicenseInfo, error) {
	if a.licenseSvc == nil {
		return LicenseInfo{State: license.StateUnactivated, CheckoutURL: license.CheckoutURL, MaxConnections: 2}, nil
	}
	return a.licenseSvc.Info(a.licenseConnectionCount()), nil
}

// ActivateLicense binds a key to this device.
func (a *App) ActivateLicense(key string) (LicenseInfo, error) {
	if a.licenseSvc == nil {
		return LicenseInfo{}, apperror.LicenseRequired()
	}
	info, _, err := a.licenseSvc.Activate(key)
	if err != nil {
		return LicenseInfo{}, a.gateLicense(err)
	}
	return info, nil
}

// DeactivateLicenseDevice removes another device from the license (device picker).
func (a *App) DeactivateLicenseDevice(deviceID string) error {
	if a.licenseSvc == nil {
		return apperror.LicenseRequired()
	}
	return a.licenseSvc.DeactivateDevice(deviceID)
}

// RequestFreeLicense registers an email for a Free key.
func (a *App) RequestFreeLicense(email string) error {
	if a.licenseSvc == nil {
		return apperror.LicenseRequired()
	}
	return a.licenseSvc.RequestFreeLicense(email)
}

// DeactivateThisDevice removes this device from the license.
func (a *App) DeactivateThisDevice() error {
	if a.licenseSvc == nil {
		return apperror.LicenseRequired()
	}
	return a.licenseSvc.DeactivateThisDevice()
}

// RemoveLicense clears the local license without contacting the license API.
func (a *App) RemoveLicense() error {
	if a.licenseSvc == nil {
		return apperror.LicenseRequired()
	}
	return a.licenseSvc.RemoveLicense()
}

// ListLicenseDevices returns active devices for the current key.
func (a *App) ListLicenseDevices() ([]LicenseDevice, error) {
	if a.licenseSvc == nil {
		return nil, apperror.LicenseRequired()
	}
	return a.licenseSvc.ListDevices()
}

// ForceValidateLicense re-checks with the license API.
func (a *App) ForceValidateLicense() (LicenseInfo, error) {
	if a.licenseSvc == nil {
		return LicenseInfo{}, apperror.LicenseRequired()
	}
	info, err := a.licenseSvc.ForceValidate()
	if err != nil {
		if e := a.gateLicense(err); e != err {
			return info, e
		}
	}
	return info, nil
}

// ConfirmQuitClose clears the close-intercept flag so Quit can proceed.
func (a *App) ConfirmQuitClose() {
	license.SetPendingCloseUpsell(false)
}

// ShouldInterceptClose reports whether the close handler should show the upsell.
func (a *App) ShouldInterceptClose() bool {
	if a.licenseSvc == nil {
		return false
	}
	info := a.licenseSvc.Info(0)
	return info.ShowCloseUpsell && !license.PendingCloseUpsell()
}

// ExportRows is gated by the export feature, then writes the table's rows to a
// user-chosen file (see exportRows in app_export.go).
func (a *App) ExportRows(database, table, format string) error {
	if err := a.requireLicense(); err != nil {
		return err
	}
	if err := a.gateLicense(a.licenseSvc.Require(license.FeatExport)); err != nil {
		return err
	}
	return a.exportRows(database, table, format)
}

// GetCheckoutURL returns the Pro upgrade URL.
func (a *App) GetCheckoutURL() string {
	if a.licenseSvc != nil {
		return a.licenseSvc.CheckoutURL()
	}
	return license.CheckoutURL
}

// LicenseActivated reports whether the app can leave the activation screen.
func (a *App) LicenseActivated() bool {
	return a.licenseSvc != nil && a.licenseSvc.Activated()
}
