// Package settings persists the single app-wide settings.json file
// (docs/prd.md §7.2).
package settings

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// AppSettings is the persisted preferences blob.
type AppSettings struct {
	AllowDestructiveWithoutWhere bool   `json:"allow_destructive_without_where"`
	DefaultTransactionMode       string `json:"default_transaction_mode"` // "auto_commit" | "explicit_commit"
	Theme                        string `json:"theme"`                    // "light" | "dark" | "system"
}

// Defaults returns the safe baseline used when no file exists yet.
func Defaults() AppSettings {
	return AppSettings{
		AllowDestructiveWithoutWhere: false,
		DefaultTransactionMode:       "auto_commit",
		Theme:                        "system",
	}
}

// Store reads/writes settings.json.
type Store struct {
	path string
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
	return &Store{path: filepath.Join(dir, "settings.json")}, nil
}

// Load returns the stored settings, or defaults if the file does not exist.
func (s *Store) Load() (AppSettings, error) {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, fs.ErrNotExist) {
		return Defaults(), nil
	}
	if err != nil {
		return Defaults(), err
	}
	out := Defaults()
	if err := json.Unmarshal(data, &out); err != nil {
		return Defaults(), err
	}
	return out, nil
}

// Save writes the settings to disk.
func (s *Store) Save(settings AppSettings) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o600)
}
