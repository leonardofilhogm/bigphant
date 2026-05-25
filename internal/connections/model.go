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
	ReadOnly        bool      `json:"read_only"`
	TransactionMode string    `json:"transaction_mode"` // "auto_commit" | "explicit_commit"
	Label           string    `json:"label"`            // user-defined tag e.g. "production"
	LabelColor      string    `json:"label_color"`      // hex color for the label bullet
	Folder          string    `json:"folder"`           // group name; "" = uncategorized
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// ConnectionMeta is the password-free view sent to the frontend.
type ConnectionMeta struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Driver          string `json:"driver"`
	Host            string `json:"host"`
	Port            int    `json:"port"`
	Username        string `json:"username"`
	DefaultDatabase string `json:"default_database"`
	ReadOnly        bool   `json:"read_only"`
	TransactionMode string `json:"transaction_mode"`
	Label           string `json:"label"`
	LabelColor      string `json:"label_color"`
	Folder          string `json:"folder"`
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
	ReadOnly        bool   `json:"read_only"`
	TransactionMode string `json:"transaction_mode"`
	Label           string `json:"label"`
	LabelColor      string `json:"label_color"`
	Folder          string `json:"folder"`
}

// Meta returns the password-free projection.
func (c Connection) Meta() ConnectionMeta {
	return ConnectionMeta{
		ID:              c.ID,
		Name:            c.Name,
		Driver:          c.Driver,
		Host:            c.Host,
		Port:            c.Port,
		Username:        c.Username,
		DefaultDatabase: c.DefaultDatabase,
		ReadOnly:        c.ReadOnly,
		TransactionMode: c.TransactionMode,
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
	return Connection{
		Name:            in.Name,
		Driver:          driver,
		Host:            in.Host,
		Port:            in.Port,
		Username:        in.Username,
		Password:        in.Password,
		DefaultDatabase: in.DefaultDatabase,
		ReadOnly:        in.ReadOnly,
		TransactionMode: mode,
		Label:           in.Label,
		LabelColor:      in.LabelColor,
		Folder:          in.Folder,
	}
}
