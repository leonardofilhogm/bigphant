package dbcontext

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Store persists per-database context Markdown files under
// ~/Library/Application Support/Bigphant/context/<connID>/<database>.md.
// The files are plaintext (schema only — no secrets).
type Store struct {
	dir string
}

// NewStore resolves the context directory (creating it if needed).
func NewStore() (*Store, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	dir := filepath.Join(base, "Bigphant", "context")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	return &Store{dir: dir}, nil
}

// sanitize makes a path-safe filename component from a connection ID or database
// name (which may contain characters like "/" on some engines).
func sanitize(s string) string {
	repl := strings.NewReplacer("/", "_", "\\", "_", "..", "_", ":", "_")
	out := repl.Replace(s)
	if out == "" {
		out = "_"
	}
	return out
}

func (s *Store) path(connID, database string) string {
	return filepath.Join(s.dir, sanitize(connID), sanitize(database)+".md")
}

// Get returns the stored markdown for a connection's database, or "" if none.
func (s *Store) Get(connID, database string) (string, error) {
	data, err := os.ReadFile(s.path(connID, database))
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// Has reports whether a context file exists for the connection's database.
func (s *Store) Has(connID, database string) bool {
	_, err := os.Stat(s.path(connID, database))
	return err == nil
}

// Save writes the markdown for a connection's database.
func (s *Store) Save(connID, database, markdown string) error {
	p := s.path(connID, database)
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	return os.WriteFile(p, []byte(markdown), 0o600)
}
