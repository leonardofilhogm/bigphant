// One-off helper to print a dev Ed25519 key pair for mock-license-api + config.go.
package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
)

func main() {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		panic(err)
	}
	fmt.Println("PUB:", base64.StdEncoding.EncodeToString(pub))
	fmt.Println("PRIV:", base64.StdEncoding.EncodeToString(priv))
}
