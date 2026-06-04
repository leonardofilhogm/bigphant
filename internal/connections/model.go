package connections

import "time"

// Connection is the full stored profile, including the plaintext password. It
// only ever exists inside the encrypted file and in memory on the Go side —
// never sent to the frontend. See docs/prd.md §5, §7.1.
type Connection struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	Driver          string    `json:"driver"`           // "mysql" | future engines
	Host            string    `json:"host"`
	Port            int       `json:"port"`
	Username        string    `json:"username"`
	Password        string    `json:"password"`
	DefaultDatabase string    `json:"default_database"`
	SSLMode         string    `json:"sslmode"` // Postgres only: "disable" | "prefer" | "require"
	ReadOnly        bool      `json:"read_only"`
	TransactionMode string    `json:"transaction_mode"` // "auto_commit" | "explicit_commit"
	EditMode        string    `json:"edit_mode"`        // "inline" | "mixed" | "side_panel"
	Label           string    `json:"label"`            // user-defined tag e.g. "production"
	LabelColor      string    `json:"label_color"`      // hex color for the label bullet
	Folder          string    `json:"folder"`           // group name; "" = uncategorized
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// ConnectionMeta is the password-free view sent to the frontend.
type ConnectionMeta struct {
	ID              string    `json:"id"`
	CreatedAt       time.Time `json:"created_at"`
	Name            string    `json:"name"`
	Driver          string `json:"driver"`
	Host            string `json:"host"`
	Port            int    `json:"port"`
	Username        string `json:"username"`
	DefaultDatabase string `json:"default_database"`
	SSLMode         string `json:"sslmode"`
	ReadOnly        bool   `json:"read_only"`
	TransactionMode string `json:"transaction_mode"`
	EditMode        string `json:"edit_mode"`
	Label           string `json:"label"`
	LabelColor      string `json:"label_color"`
	Folder          string `json:"folder"`
	Locked          bool   `json:"locked,omitempty"`
}

// ConnectionInput is the payload from the New/Edit Connection form.
type ConnectionInput struct {
	Name            string `json:"name"`
	Driver          string `json:"driver"`
	Host            string `json:"host"`
	Port            int    `json:"port"`
	Username        string `json:"username"`
	Password        string `json:"password"`
	DefaultDatabase string `json:"default_database"`
	SSLMode         string `json:"sslmode"`
	ReadOnly        bool   `json:"read_only"`
	TransactionMode string `json:"transaction_mode"`
	EditMode        string `json:"edit_mode"`
	Label           string `json:"label"`
	LabelColor      string `json:"label_color"`
	Folder          string `json:"folder"`
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
		DefaultDatabase: c.DefaultDatabase,
		SSLMode:         c.SSLMode,
		ReadOnly:        c.ReadOnly,
		TransactionMode: c.TransactionMode,
		EditMode:        editMode,
		Label:           c.Label,
		LabelColor:      c.LabelColor,
		Folder:          c.Folder,
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
	return Connection{
		Name:            in.Name,
		Driver:          driver,
		Host:            in.Host,
		Port:            in.Port,
		Username:        in.Username,
		Password:        in.Password,
		DefaultDatabase: in.DefaultDatabase,
		SSLMode:         sslmode,
		ReadOnly:        in.ReadOnly,
		TransactionMode: mode,
		EditMode:        in.EditMode,
		Label:           in.Label,
		LabelColor:      in.LabelColor,
		Folder:          in.Folder,
	}
}
