package connections

import "time"

// Connection is the full stored profile, including the plaintext password. It
// only ever exists inside the encrypted file and in memory on the Go side —
// never sent to the frontend. See docs/prd.md §5, §7.1.
type Connection struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Driver          string `json:"driver"` // "mysql" | "mariadb" | "postgres" | "sqlite"
	Host            string `json:"host"`
	Port            int    `json:"port"`
	Username        string `json:"username"`
	Password        string `json:"password"`
	FilePath        string `json:"file_path"` // SQLite only: path to the database file. Non-secret.
	DefaultDatabase string `json:"default_database"`
	SSLMode         string `json:"sslmode"` // Postgres only: "disable" | "prefer" | "require"
	ReadOnly        bool   `json:"read_only"`
	TransactionMode string `json:"transaction_mode"` // "auto_commit" | "explicit_commit"
	EditMode        string `json:"edit_mode"`        // "inline" | "mixed" | "side_panel"
	Label           string `json:"label"`            // user-defined tag e.g. "production"
	LabelColor      string `json:"label_color"`      // hex color for the label bullet
	Folder          string `json:"folder"`           // group name; "" = uncategorized

	// SSH tunnel. When SSHEnabled, the Go backend opens an SSH connection to
	// SSHHost:SSHPort and tunnels the database connection through it. The three
	// secret fields (password, private key, passphrase) live only inside the
	// encrypted file and in memory — never in ConnectionMeta. See docs/prd.md §5.
	SSHEnabled    bool   `json:"ssh_enabled"`
	SSHHost       string `json:"ssh_host"`
	SSHPort       int    `json:"ssh_port"`
	SSHUsername   string `json:"ssh_username"`
	SSHAuthMethod string `json:"ssh_auth_method"` // "password" | "key"
	SSHPassword   string `json:"ssh_password"`
	SSHKeyPath    string `json:"ssh_key_path"`    // path to a private key file; takes precedence over SSHPrivateKey
	SSHPrivateKey string `json:"ssh_private_key"` // PEM contents (used when SSHKeyPath is empty)
	SSHPassphrase string `json:"ssh_passphrase"`  // unlocks an encrypted private key

	// AI Assistant (v0.4.0). When AIEnabled, every AI query runs through a
	// read-only path. AIMode is "db_user" (a dedicated SELECT-only database
	// user Bigphant provisioned, whose credentials live below) or "app_layer"
	// (the connection lacked privilege to create a user, so the main credentials
	// are reused with read-only enforcement). AIUsername/AIPassword are secrets:
	// stored only inside the encrypted file, never projected into ConnectionMeta.
	AIEnabled  bool   `json:"ai_enabled"`
	AIMode     string `json:"ai_mode"` // "db_user" | "app_layer"
	AIUsername string `json:"ai_username"`
	AIPassword string `json:"ai_password"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ConnectionMeta is the password-free view sent to the frontend.
type ConnectionMeta struct {
	ID              string    `json:"id"`
	CreatedAt       time.Time `json:"created_at"`
	Name            string    `json:"name"`
	Driver          string    `json:"driver"`
	Host            string    `json:"host"`
	Port            int       `json:"port"`
	Username        string    `json:"username"`
	FilePath        string    `json:"file_path"`
	DefaultDatabase string    `json:"default_database"`
	SSLMode         string    `json:"sslmode"`
	ReadOnly        bool      `json:"read_only"`
	TransactionMode string    `json:"transaction_mode"`
	EditMode        string    `json:"edit_mode"`
	Label           string    `json:"label"`
	LabelColor      string    `json:"label_color"`
	Folder          string    `json:"folder"`

	// SSH tunnel metadata — non-secret fields only. The SSH password, private
	// key, and passphrase are never projected into the frontend-facing view.
	SSHEnabled    bool   `json:"ssh_enabled"`
	SSHHost       string `json:"ssh_host"`
	SSHPort       int    `json:"ssh_port"`
	SSHUsername   string `json:"ssh_username"`
	SSHAuthMethod string `json:"ssh_auth_method"`
	SSHKeyPath    string `json:"ssh_key_path"`

	// AI Assistant status (non-secret). AIUsername/AIPassword are never projected.
	AIEnabled bool   `json:"ai_enabled"`
	AIMode    string `json:"ai_mode"`

	Locked bool `json:"locked,omitempty"`
}

// ConnectionInput is the payload from the New/Edit Connection form.
type ConnectionInput struct {
	Name            string `json:"name"`
	Driver          string `json:"driver"`
	Host            string `json:"host"`
	Port            int    `json:"port"`
	Username        string `json:"username"`
	Password        string `json:"password"`
	FilePath        string `json:"file_path"`
	DefaultDatabase string `json:"default_database"`
	SSLMode         string `json:"sslmode"`
	ReadOnly        bool   `json:"read_only"`
	TransactionMode string `json:"transaction_mode"`
	EditMode        string `json:"edit_mode"`
	Label           string `json:"label"`
	LabelColor      string `json:"label_color"`
	Folder          string `json:"folder"`

	SSHEnabled    bool   `json:"ssh_enabled"`
	SSHHost       string `json:"ssh_host"`
	SSHPort       int    `json:"ssh_port"`
	SSHUsername   string `json:"ssh_username"`
	SSHAuthMethod string `json:"ssh_auth_method"`
	SSHPassword   string `json:"ssh_password"`
	SSHKeyPath    string `json:"ssh_key_path"`
	SSHPrivateKey string `json:"ssh_private_key"`
	SSHPassphrase string `json:"ssh_passphrase"`
}

// Meta returns the password-free projection.
func (c Connection) Meta() ConnectionMeta {
	editMode := c.EditMode
	if editMode == "" {
		// Connections saved before edit_mode existed default to the mixed flow.
		editMode = "mixed"
	}
	return ConnectionMeta{
		ID:              c.ID,
		CreatedAt:       c.CreatedAt,
		Name:            c.Name,
		Driver:          c.Driver,
		Host:            c.Host,
		Port:            c.Port,
		Username:        c.Username,
		FilePath:        c.FilePath,
		DefaultDatabase: c.DefaultDatabase,
		SSLMode:         c.SSLMode,
		ReadOnly:        c.ReadOnly,
		TransactionMode: c.TransactionMode,
		EditMode:        editMode,
		Label:           c.Label,
		LabelColor:      c.LabelColor,
		Folder:          c.Folder,
		SSHEnabled:      c.SSHEnabled,
		SSHHost:         c.SSHHost,
		SSHPort:         c.SSHPort,
		SSHUsername:     c.SSHUsername,
		SSHAuthMethod:   c.SSHAuthMethod,
		SSHKeyPath:      c.SSHKeyPath,
		AIEnabled:       c.AIEnabled,
		AIMode:          c.AIMode,
	}
}

// FromInput builds a Connection (sans ID/timestamps) from form input.
func fromInput(in ConnectionInput) Connection {
	mode := in.TransactionMode
	if mode == "" {
		mode = "auto_commit"
	}
	driver := in.Driver
	if driver == "" {
		driver = "mysql"
	}
	sslmode := in.SSLMode
	if driver == "postgres" && sslmode == "" {
		sslmode = "prefer"
	}
	// SQLite is a local file: it has no host/port/user/password. Keep those blank
	// even if the form left stale values, so the stored profile stays coherent.
	host, port, username, password := in.Host, in.Port, in.Username, in.Password
	if driver == "sqlite" {
		host, port, username, password = "", 0, "", ""
	}
	sshPort := in.SSHPort
	sshAuth := in.SSHAuthMethod
	if in.SSHEnabled {
		if sshPort == 0 {
			sshPort = 22
		}
		if sshAuth == "" {
			sshAuth = "password"
		}
	}
	return Connection{
		Name:            in.Name,
		Driver:          driver,
		Host:            host,
		Port:            port,
		Username:        username,
		Password:        password,
		FilePath:        in.FilePath,
		DefaultDatabase: in.DefaultDatabase,
		SSLMode:         sslmode,
		ReadOnly:        in.ReadOnly,
		TransactionMode: mode,
		EditMode:        in.EditMode,
		Label:           in.Label,
		LabelColor:      in.LabelColor,
		Folder:          in.Folder,
		SSHEnabled:      in.SSHEnabled,
		SSHHost:         in.SSHHost,
		SSHPort:         sshPort,
		SSHUsername:     in.SSHUsername,
		SSHAuthMethod:   sshAuth,
		SSHPassword:     in.SSHPassword,
		SSHKeyPath:      in.SSHKeyPath,
		SSHPrivateKey:   in.SSHPrivateKey,
		SSHPassphrase:   in.SSHPassphrase,
	}
}
