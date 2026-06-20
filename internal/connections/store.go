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
	if c.EditMode == "" {
		c.EditMode = "mixed"
	}
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
	// SSH secrets are write-only from the form's perspective (never sent back to
	// the frontend), so a blank value on update means "keep what's stored".
	if c.SSHPassword == "" {
		c.SSHPassword = existing.SSHPassword
	}
	if c.SSHPrivateKey == "" {
		c.SSHPrivateKey = existing.SSHPrivateKey
	}
	if c.SSHPassphrase == "" {
		c.SSHPassphrase = existing.SSHPassphrase
	}
	// edit_mode is set from the workspace topbar (SetEditMode), not the
	// New/Edit form, which never sends it — a blank value preserves the
	// stored choice instead of resetting it to the default.
	if c.EditMode == "" {
		c.EditMode = existing.EditMode
	}
	// AI Assistant fields are provisioned via SetAIUser, never via the form, so
	// the form payload always carries their zero values — preserve the stored
	// ones so editing a connection does not silently disable AI.
	c.AIEnabled = existing.AIEnabled
	c.AIMode = existing.AIMode
	c.AIUsername = existing.AIUsername
	c.AIPassword = existing.AIPassword
	if err := s.save(c); err != nil {
		return ConnectionMeta{}, err
	}
	return c.Meta(), nil
}

// SetEditMode updates only the row-editing method for a connection, leaving
// every other field (including the password) untouched. Driven by the
// workspace topbar; works regardless of the read-only flag since it's a UI
// preference, not a write to the database.
func (s *Store) SetEditMode(id, mode string) (ConnectionMeta, error) {
	c, err := s.Get(id)
	if err != nil {
		return ConnectionMeta{}, err
	}
	c.EditMode = mode
	c.UpdatedAt = time.Now().UTC()
	if err := s.save(c); err != nil {
		return ConnectionMeta{}, err
	}
	return c.Meta(), nil
}

// SetAIUser persists the AI Assistant enablement and (for "db_user" mode) the
// dedicated read-only credentials Bigphant provisioned, leaving every other
// field untouched. The credentials are secrets: they live only in the encrypted
// file and are never projected into ConnectionMeta. Passing an empty username
// keeps the previously stored one (so re-enabling in app_layer mode does not
// wipe an earlier db_user credential).
func (s *Store) SetAIUser(id, mode, username, password string) (ConnectionMeta, error) {
	c, err := s.Get(id)
	if err != nil {
		return ConnectionMeta{}, err
	}
	c.AIEnabled = true
	c.AIMode = mode
	if username != "" {
		c.AIUsername = username
		c.AIPassword = password
	}
	c.UpdatedAt = time.Now().UTC()
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
