package maint

import (
	"crypto/rand"
	"encoding/base64"
)

// RandomPassword returns a URL-safe password safe to inline in CREATE USER literals.
func RandomPassword() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
