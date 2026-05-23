package connections

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"bigphant/internal/crypto"
)

// Store manages encrypted connection profile files, one per connection, under
// ~/Library/Application Support/Bigphant/connections/<uuid>.enc.
type Store struct {
	dir string
}

// NewStore resolves the connections directory (creating it if needed).
func NewStore() (*Store, error) {
	base, err := os.UserConfigDir() // macOS: ~/Library/Application Support
	if err != nil {
		return nil, err
	}
	dir := filepath.Join(base, "Bigphant", "connections")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	return &Store{dir: dir}, nil
}

func (s *Store) path(id string) string {
	return filepath.Join(s.dir, id+".enc")
}

// List returns password-free metadata for every stored connection.
func (s *Store) List() ([]ConnectionMeta, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, err
	}
	metas := make([]ConnectionMeta, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".enc") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".enc")
		c, err := s.Get(id)
		if err != nil {
			// Skip unreadable files rather than failing the whole list.
			continue
		}
		metas = append(metas, c.Meta())
	}
	sort.Slice(metas, func(i, j int) bool { return metas[i].Name < metas[j].Name })
	return metas, nil
}

// Get reads and decrypts a single connection by ID.
func (s *Store) Get(id string) (Connection, error) {
	var c Connection
	enc, err := os.ReadFile(s.path(id))
	if err != nil {
		return c, err
	}
	plain, err := crypto.Decrypt(enc)
	if err != nil {
		return c, fmt.Errorf("decrypt connection %s: %w", id, err)
	}
	if err := json.Unmarshal(plain, &c); err != nil {
		return c, err
	}
	return c, nil
}

// Create persists a new connection and returns its metadata.
func (s *Store) Create(in ConnectionInput) (ConnectionMeta, error) {
	c := fromInput(in)
	c.ID = uuid.NewString()
	now := time.Now().UTC()
	c.CreatedAt = now
	c.UpdatedAt = now
	if err := s.save(c); err != nil {
		return ConnectionMeta{}, err
	}
	return c.Meta(), nil
}

// Update overwrites an existing connection. A blank password preserves the
// previously stored one (the frontend never holds the password to resend).
func (s *Store) Update(id string, in ConnectionInput) (ConnectionMeta, error) {
	existing, err := s.Get(id)
	if err != nil {
		return ConnectionMeta{}, err
	}
	c := fromInput(in)
	c.ID = id
	c.CreatedAt = existing.CreatedAt
	c.UpdatedAt = time.Now().UTC()
	if c.Password == "" {
		c.Password = existing.Password
	}
	if err := s.save(c); err != nil {
		return ConnectionMeta{}, err
	}
	return c.Meta(), nil
}

// Delete removes a connection file.
func (s *Store) Delete(id string) error {
	return os.Remove(s.path(id))
}

func (s *Store) save(c Connection) error {
	plain, err := json.Marshal(c)
	if err != nil {
		return err
	}
	enc, err := crypto.Encrypt(plain)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path(c.ID), enc, 0o600)
}
