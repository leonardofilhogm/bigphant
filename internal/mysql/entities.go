package mysql

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"

	"bigphant/internal/dbtypes"
)

var entityKindOrder = map[string]int{
	"view":              0,
	"materialized_view": 1,
	"function":          2,
	"procedure":         3,
	"trigger":           4,
	"sequence":          5,
	"event":             6,
	"enum":              7,
}

// ListEntities returns non-table objects in a database (views, routines, …).
func (c *Conn) ListEntities(database string) ([]dbtypes.Entity, error) {
	var all []dbtypes.Entity

	appendErr := func(batch []dbtypes.Entity, err error) error {
		if err != nil {
			return err
		}
		all = append(all, batch...)
		return nil
	}

	if err := appendErr(c.listViews(database)); err != nil {
		return nil, err
	}
	if err := appendErr(c.listRoutines(database)); err != nil {
		return nil, err
	}
	if err := appendErr(c.listTriggers(database)); err != nil {
		return nil, err
	}
	if err := appendErr(c.listEvents(database)); err != nil {
		return nil, err
	}

	sort.Slice(all, func(i, j int) bool {
		ki, kj := entityKindOrder[all[i].Kind], entityKindOrder[all[j].Kind]
		if ki != kj {
			return ki < kj
		}
		return all[i].Name < all[j].Name
	})
	return all, nil
}

func (c *Conn) listViews(database string) ([]dbtypes.Entity, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT TABLE_NAME
		FROM INFORMATION_SCHEMA.VIEWS
		WHERE TABLE_SCHEMA = ?
		ORDER BY TABLE_NAME`
	rows, err := c.DB.QueryContext(ctx, q, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []dbtypes.Entity
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, dbtypes.Entity{Name: name, Kind: "view"})
	}
	return out, rows.Err()
}

func (c *Conn) listRoutines(database string) ([]dbtypes.Entity, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT r.ROUTINE_NAME,
		       r.ROUTINE_TYPE,
		       COALESCE(r.DTD_IDENTIFIER, r.DATA_TYPE, ''),
		       COALESCE(pc.cnt, 0)
		FROM INFORMATION_SCHEMA.ROUTINES r
		LEFT JOIN (
			SELECT SPECIFIC_SCHEMA, SPECIFIC_NAME, COUNT(*) AS cnt
			FROM INFORMATION_SCHEMA.PARAMETERS
			WHERE ORDINAL_POSITION > 0
			GROUP BY SPECIFIC_SCHEMA, SPECIFIC_NAME
		) pc ON pc.SPECIFIC_SCHEMA = r.ROUTINE_SCHEMA AND pc.SPECIFIC_NAME = r.SPECIFIC_NAME
		WHERE r.ROUTINE_SCHEMA = ?
		ORDER BY r.ROUTINE_NAME`
	rows, err := c.DB.QueryContext(ctx, q, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []dbtypes.Entity
	for rows.Next() {
		var (
			name, routineType, returnType string
			paramCount                    int
		)
		if err := rows.Scan(&name, &routineType, &returnType, &paramCount); err != nil {
			return nil, err
		}
		kind := "procedure"
		if routineType == "FUNCTION" {
			kind = "function"
		}
		extra := fmt.Sprintf("(%d) → %s", paramCount, returnType)
		if returnType == "" {
			extra = fmt.Sprintf("(%d params)", paramCount)
		}
		out = append(out, dbtypes.Entity{Name: name, Kind: kind, Extra: extra})
	}
	return out, rows.Err()
}

func (c *Conn) listTriggers(database string) ([]dbtypes.Entity, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE
		FROM INFORMATION_SCHEMA.TRIGGERS
		WHERE TRIGGER_SCHEMA = ?
		ORDER BY TRIGGER_NAME`
	rows, err := c.DB.QueryContext(ctx, q, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []dbtypes.Entity
	for rows.Next() {
		var name, table string
		if err := rows.Scan(&name, &table); err != nil {
			return nil, err
		}
		out = append(out, dbtypes.Entity{
			Name:  name,
			Kind:  "trigger",
			Extra: "on " + table,
		})
	}
	return out, rows.Err()
}

func (c *Conn) listEvents(database string) ([]dbtypes.Entity, error) {
	ctx, cancel := ctx5()
	defer cancel()
	const q = `
		SELECT EVENT_NAME,
		       COALESCE(DATE_FORMAT(EXECUTE_AT, '%Y-%m-%d %H:%i'), ''),
		       COALESCE(DATE_FORMAT(STARTS, '%Y-%m-%d %H:%i'), '')
		FROM INFORMATION_SCHEMA.EVENTS
		WHERE EVENT_SCHEMA = ?
		ORDER BY EVENT_NAME`
	rows, err := c.DB.QueryContext(ctx, q, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []dbtypes.Entity
	for rows.Next() {
		var name, executeAt, starts string
		if err := rows.Scan(&name, &executeAt, &starts); err != nil {
			return nil, err
		}
		extra := executeAt
		if extra == "" {
			extra = starts
		}
		out = append(out, dbtypes.Entity{Name: name, Kind: "event", Extra: extra})
	}
	return out, rows.Err()
}

// EntityDefinition returns the canonical CREATE statement for a non-table entity.
func (c *Conn) EntityDefinition(database, _ /* schema */, kind, name string) (string, error) {
	ctx, cancel := ctx5()
	defer cancel()

	quoted := quoteMySQLQualified(database, name)
	var stmt string
	switch kind {
	case "view":
		stmt = fmt.Sprintf("SHOW CREATE VIEW %s", quoted)
	case "function":
		stmt = fmt.Sprintf("SHOW CREATE FUNCTION %s", quoted)
	case "procedure":
		stmt = fmt.Sprintf("SHOW CREATE PROCEDURE %s", quoted)
	case "trigger":
		stmt = fmt.Sprintf("SHOW CREATE TRIGGER %s", quoted)
	case "event":
		stmt = fmt.Sprintf("SHOW CREATE EVENT %s", quoted)
	default:
		return "", fmt.Errorf("unsupported entity kind %q", kind)
	}

	rows, err := c.DB.QueryContext(ctx, stmt)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return "", err
		}
		return "", fmt.Errorf("no definition returned for %s", name)
	}
	cols, err := rows.Columns()
	if err != nil {
		return "", err
	}
	dest := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range dest {
		var holder sql.NullString
		dest[i] = &holder
		ptrs[i] = dest[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return "", err
	}
	for i, col := range cols {
		if strings.HasPrefix(col, "Create") {
			if h, ok := dest[i].(*sql.NullString); ok && h.Valid {
				return h.String, nil
			}
		}
	}
	return "", fmt.Errorf("no definition returned for %s", name)
}

func quoteMySQLIdent(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

func quoteMySQLQualified(database, name string) string {
	if database == "" {
		return quoteMySQLIdent(name)
	}
	return quoteMySQLIdent(database) + "." + quoteMySQLIdent(name)
}
