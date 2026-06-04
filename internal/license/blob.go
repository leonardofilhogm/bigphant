package license

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims are the signed license blob payload (§5.2).
type Claims struct {
	jwt.RegisteredClaims
	Plan            string     `json:"plan"`
	Email           string     `json:"email"`
	DeviceID        string     `json:"device_id"`
	Features        FeatureSet `json:"features"`
	MaxDevices      int        `json:"max_devices"`
	LastValidatedAt int64      `json:"last_validated_at"`
	LicenseKey      string     `json:"license_key,omitempty"`
}

// licenseKey is a separate static AES key for license.enc (same weakness as connections).
var licenseKey = [32]byte{
	0x42, 0x69, 0x67, 0x70, 0x68, 0x61, 0x6e, 0x74,
	0x2d, 0x6c, 0x69, 0x63, 0x2d, 0x73, 0x74, 0x61,
	0x74, 0x69, 0x63, 0x2d, 0x6b, 0x65, 0x79, 0x2d,
	0x76, 0x30, 0x32, 0x2d, 0x61, 0x65, 0x73, 0x32,
}

// Store persists the encrypted JWT at ~/Library/Application Support/Bigphant/license.enc.
type Store struct {
	dir  string
	path string
	pub  ed25519.PublicKey
}

func NewStore() (*Store, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	dir := filepath.Join(base, "Bigphant")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	pubBytes, err := base64.StdEncoding.DecodeString(PublicKeyB64)
	if err != nil {
		return nil, fmt.Errorf("license public key: %w", err)
	}
	if len(pubBytes) != ed25519.PublicKeySize {
		return nil, errors.New("invalid license public key length")
	}
	return &Store{
		dir:  dir,
		path: filepath.Join(dir, "license.enc"),
		pub:  ed25519.PublicKey(pubBytes),
	}, nil
}

func (s *Store) BaseDir() string { return s.dir }

func (s *Store) Load() (*Claims, string, error) {
	enc, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, "", nil
		}
		return nil, "", err
	}
	plain, err := decrypt(enc)
	if err != nil {
		return nil, "", err
	}
	tokenStr := string(plain)
	claims, err := s.parseJWT(tokenStr)
	if err != nil {
		return nil, "", err
	}
	return claims, tokenStr, nil
}

func (s *Store) Save(token string) error {
	enc, err := encrypt([]byte(token))
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, enc, 0o600)
}

func (s *Store) Clear() error {
	err := os.Remove(s.path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *Store) parseJWT(tokenStr string) (*Claims, error) {
	parser := jwt.NewParser(jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}))
	tok, err := parser.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return s.pub, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok || !tok.Valid {
		return nil, errors.New("invalid license token")
	}
	return claims, nil
}

func (s *Store) VerifyAndSave(token string) (*Claims, error) {
	claims, err := s.parseJWT(token)
	if err != nil {
		return nil, err
	}
	if err := s.Save(token); err != nil {
		return nil, err
	}
	return claims, nil
}

func encrypt(plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(licenseKey[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return aead.Seal(nonce, nonce, plaintext, nil), nil
}

func decrypt(data []byte) ([]byte, error) {
	block, err := aes.NewCipher(licenseKey[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	ns := aead.NonceSize()
	if len(data) < ns {
		return nil, errors.New("license ciphertext too short")
	}
	nonce, ciphertext := data[:ns], data[ns:]
	return aead.Open(nil, nonce, ciphertext, nil)
}

// ExpiresUnix returns subscription expiry or 0.
func (c *Claims) ExpiresUnix() int64 {
	if c.ExpiresAt == nil {
		return 0
	}
	return c.ExpiresAt.Unix()
}

// IssuedUnix returns issued_at.
func (c *Claims) IssuedUnix() int64 {
	if c.IssuedAt == nil {
		return 0
	}
	return c.IssuedAt.Unix()
}

// IsPro reports whether the plan is pro.
func (c *Claims) IsPro() bool { return c.Plan == "pro" }

// GraceExceeded reports whether offline grace (3 days) has been exceeded.
func (c *Claims) GraceExceeded(now time.Time) bool {
	const grace = 3 * 24 * time.Hour
	if c.LastValidatedAt == 0 {
		return false
	}
	last := time.Unix(c.LastValidatedAt, 0)
	return now.Sub(last) > grace
}

// SubscriptionExpired reports Pro subscription end.
func (c *Claims) SubscriptionExpired(now time.Time) bool {
	exp := c.ExpiresUnix()
	if exp == 0 {
		return false
	}
	// Free licenses use far-future expiry.
	if exp > now.Add(365 * 24 * time.Hour).Unix() {
		return false
	}
	return now.Unix() > exp
}

// MarshalFeatures ensures Features is populated from plan if empty.
func (c *Claims) NormalizeFeatures() {
	if c.Features.MaxConnections == 0 && !c.Features.Export && c.Plan != "" {
		c.Features = FeaturesForPlan(c.Plan)
	}
}

// MaskKey masks a BP-… key for display.
func MaskKey(key string) string {
	parts := splitKey(key)
	if len(parts) < 5 {
		return key
	}
	for i := 1; i < len(parts)-1; i++ {
		if len(parts[i]) > 0 {
			parts[i] = "•••••"
		}
	}
	return joinKey(parts)
}

func splitKey(key string) []string {
	var out []string
	cur := ""
	for _, r := range key {
		if r == '-' {
			out = append(out, cur)
			cur = ""
		} else {
			cur += string(r)
		}
	}
	out = append(out, cur)
	return out
}

func joinKey(parts []string) string {
	s := parts[0]
	for i := 1; i < len(parts); i++ {
		s += "-" + parts[i]
	}
	return s
}
