// Package crypto provides AES-256-GCM helpers for encrypting connection
// profile files on disk.
//
// KNOWN POC WEAKNESS: the encryption key is a static, app-bound constant
// compiled into the binary. Anyone with the binary can decrypt connection
// files. This is acceptable only for the proof of concept; v0.2 must derive
// the key from (or store it in) the macOS Keychain. See docs/prd.md §5, §11.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"io"
)

// pocKey is a fixed 32-byte (AES-256) key. See the package doc for why this is
// a known weakness slated for replacement by the Keychain in v0.2.
var pocKey = [32]byte{
	0x42, 0x69, 0x67, 0x70, 0x68, 0x61, 0x6e, 0x74,
	0x2d, 0x70, 0x6f, 0x63, 0x2d, 0x73, 0x74, 0x61,
	0x74, 0x69, 0x63, 0x2d, 0x6b, 0x65, 0x79, 0x2d,
	0x76, 0x30, 0x31, 0x2d, 0x61, 0x65, 0x73, 0x32,
}

func gcm() (cipher.AEAD, error) {
	block, err := aes.NewCipher(pocKey[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// Encrypt seals plaintext with AES-256-GCM and returns nonce||ciphertext.
func Encrypt(plaintext []byte) ([]byte, error) {
	aead, err := gcm()
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	// Seal appends ciphertext to nonce so the nonce is stored alongside it.
	return aead.Seal(nonce, nonce, plaintext, nil), nil
}

// Decrypt reverses Encrypt, expecting nonce||ciphertext.
func Decrypt(data []byte) ([]byte, error) {
	aead, err := gcm()
	if err != nil {
		return nil, err
	}
	ns := aead.NonceSize()
	if len(data) < ns {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ciphertext := data[:ns], data[ns:]
	return aead.Open(nil, nonce, ciphertext, nil)
}
