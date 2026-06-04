package license

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/google/uuid"
)

// DeviceMeta is sent to the license API on activation.
type DeviceMeta struct {
	Name             string `json:"name"`
	Platform         string `json:"platform"`
	Arch             string `json:"arch"`
	AppVersion       string `json:"app_version"`
	FingerprintKind  string `json:"fingerprint_kind"`
}

// DeviceID returns the hashed device fingerprint (§6.1).
func DeviceID(baseDir string) (id string, meta DeviceMeta, err error) {
	hw, kind, err := hardwareID(baseDir)
	if err != nil {
		return "", DeviceMeta{}, err
	}
	user := os.Getenv("USER")
	if user == "" {
		user = "unknown"
	}
	raw := fmt.Sprintf("%s|%s|%s", runtime.GOOS, hw, user)
	sum := sha256.Sum256([]byte(raw))
	id = hex.EncodeToString(sum[:])

	host, _ := os.Hostname()
	meta = DeviceMeta{
		Name:            host,
		Platform:        runtime.GOOS,
		Arch:            runtime.GOARCH,
		AppVersion:      appVersion(),
		FingerprintKind: kind,
	}
	return id, meta, nil
}

func fallbackPath(baseDir string) string {
	return filepath.Join(baseDir, "device_fallback.id")
}

func appVersion() string {
	return "0.2.0-dev"
}

func loadOrCreateFallback(baseDir string) (string, string, error) {
	path := fallbackPath(baseDir)
	if b, err := os.ReadFile(path); err == nil && len(b) > 0 {
		return strings.TrimSpace(string(b)), "fallback", nil
	}
	id := uuid.NewString()
	if err := os.MkdirAll(baseDir, 0o700); err != nil {
		return "", "", err
	}
	if err := os.WriteFile(path, []byte(id), 0o600); err != nil {
		return "", "", err
	}
	return id, "fallback", nil
}
