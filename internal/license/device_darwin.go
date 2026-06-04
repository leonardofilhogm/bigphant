//go:build darwin

package license

import (
	"os/exec"
	"regexp"
	"strings"

)

var reIOPlatformUUID = regexp.MustCompile(`"IOPlatformUUID"\s*=\s*"([^"]+)"`)

func hardwareID(baseDir string) (hw string, kind string, err error) {
	if id := darwinIOPlatformUUID(); id != "" {
		return id, "hardware", nil
	}
	return loadOrCreateFallback(baseDir)
}

func darwinIOPlatformUUID() string {
	out, err := exec.Command("/usr/sbin/ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
	if err != nil {
		return ""
	}
	m := reIOPlatformUUID.FindStringSubmatch(string(out))
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}
