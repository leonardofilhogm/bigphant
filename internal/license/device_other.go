//go:build !darwin

package license

func hardwareID(baseDir string) (hw string, kind string, err error) {
	return loadOrCreateFallback(baseDir)
}
