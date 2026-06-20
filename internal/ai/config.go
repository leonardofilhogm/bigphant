// Package ai implements the v0.4.0 AI Assistant: an OpenRouter-backed agentic
// chat that answers plain-language questions about a database. Every query the
// model runs goes through a read-only SQL tool (SELECT only), and the user's
// OpenRouter API key is stored encrypted on disk — never sent to the frontend.
//
// OpenRouter is the single sanctioned AI endpoint (https://openrouter.ai). It is
// the only external network call this feature makes, alongside the existing
// license API.
package ai

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"bigphant/internal/crypto"
)

// Config holds the bring-your-own-key AI settings. The API key is a secret: it
// is persisted only inside the AES-256-GCM encrypted ai.enc file and is never
// projected to the frontend (GetAIConfig returns HasKey instead).
type Config struct {
	APIKey string `json:"api_key"`
	Model  string `json:"model"` // OpenRouter model slug, e.g. "anthropic/claude-sonnet-4"
}

// ConfigStore reads/writes the encrypted ai.enc file.
type ConfigStore struct {
	path string
}

// NewConfigStore resolves ~/Library/Application Support/Bigphant/ai.enc.
func NewConfigStore() (*ConfigStore, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	dir := filepath.Join(base, "Bigphant")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	return &ConfigStore{path: filepath.Join(dir, "ai.enc")}, nil
}

// Load returns the stored config, or a zero Config if no file exists yet.
func (s *ConfigStore) Load() (Config, error) {
	var cfg Config
	enc, err := os.ReadFile(s.path)
	if errors.Is(err, fs.ErrNotExist) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	plain, err := crypto.Decrypt(enc)
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(plain, &cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

// Save encrypts and writes the config. A blank APIKey preserves the stored one,
// mirroring the connection-password rule (the frontend never holds the key to
// resend it).
func (s *ConfigStore) Save(cfg Config) error {
	if cfg.APIKey == "" {
		if existing, err := s.Load(); err == nil {
			cfg.APIKey = existing.APIKey
		}
	}
	plain, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	enc, err := crypto.Encrypt(plain)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, enc, 0o600)
}
