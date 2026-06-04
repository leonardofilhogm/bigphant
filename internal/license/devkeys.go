package license

// Dev license keys — valid only against tools/mock-license-api (local :8787).
const (
	DevFreeLicenseKey = "BP-FREE-DEV00-DEV01-DEV02-DEV03"
	DevProLicenseKey  = "BP-PRO-DEV00-DEV01-DEV02-DEV03"
)

// DevLicenseKey returns the key for plan "free" or "pro", or "" if unknown.
func DevLicenseKey(plan string) string {
	switch plan {
	case "free":
		return DevFreeLicenseKey
	case "pro":
		return DevProLicenseKey
	default:
		return ""
	}
}
