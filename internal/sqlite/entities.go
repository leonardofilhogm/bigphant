package sqlite

import (
	"database/sql"
	"fmt"
	"sort"

	"bigphant/internal/dbtypes"
)

var entityKindOrder = map[string]int{
	"view":    0,
	"trigger": 1,
}

// ListEntities returns non-table objects in the file: views and triggers.
// Indexes are surfaced per-table in DescribeTable, not here, matching the other
// connectors.
func (c *Conn) ListEntities(_ string) ([]dbtypes.Entity, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT type, name, COALESCE(tbl_name, '')
		FROM sqlite_master
		WHERE type IN ('view', 'trigger') AND name NOT LIKE 'sqlite_%'
		ORDER BY name`
	rows, err := c.DB.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []dbtypes.Entity
	for rows.Next() {
		var kind, name, tbl string
		if err := rows.Scan(&kind, &name, &tbl); err != nil {
			return nil, err
		}
		e := dbtypes.Entity{Name: name, Kind: kind}
		if kind == "trigger" && tbl != "" {
			e.Extra = "on " + tbl
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	sort.Slice(out, func(i, j int) bool {
		ki, kj := entityKindOrder[out[i].Kind], entityKindOrder[out[j].Kind]
		if ki != kj {
			return ki < kj
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

// EntityDefinition returns the canonical CREATE statement SQLite stored for a
// view or trigger (the verbatim `sql` column of sqlite_master).
func (c *Conn) EntityDefinition(_, _ /* schema */, kind, name string) (string, error) {
	switch kind {
	case "view", "trigger", "index", "table":
		// supported object types stored in sqlite_master
	default:
		return "", fmt.Errorf("unsupported entity kind %q", kind)
	}

	ctx, cancel := ctx5()
	defer cancel()
	var def sql.NullString
	err := c.DB.QueryRowContext(ctx,
		"SELECT sql FROM sqlite_master WHERE type = ? AND name = ?", kind, name,
	).Scan(&def)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("no definition found for %s %q", kind, name)
	}
	if err != nil {
		return "", err
	}
	if !def.Valid {
		return "", fmt.Errorf("no definition available for %s %q", kind, name)
	}
	return def.String, nil
}
