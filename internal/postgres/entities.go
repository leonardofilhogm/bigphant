package postgres

import (
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

// ListEntities returns non-table objects in a schema.
func (c *Conn) ListEntities(schema string) ([]dbtypes.Entity, error) {
	var all []dbtypes.Entity

	appendErr := func(batch []dbtypes.Entity, err error) error {
		if err != nil {
			return err
		}
		all = append(all, batch...)
		return nil
	}

	if err := appendErr(c.listRelationEntities(schema, "view", "v")); err != nil {
		return nil, err
	}
	if err := appendErr(c.listRelationEntities(schema, "materialized_view", "m")); err != nil {
		return nil, err
	}
	if err := appendErr(c.listRoutines(schema)); err != nil {
		return nil, err
	}
	if err := appendErr(c.listTriggers(schema)); err != nil {
		return nil, err
	}
	if err := appendErr(c.listSequences(schema)); err != nil {
		return nil, err
	}
	if err := appendErr(c.listEnums(schema)); err != nil {
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

func (c *Conn) listRelationEntities(schema, kind, relkind string) ([]dbtypes.Entity, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `
		SELECT c.relname
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relkind = $2
		ORDER BY c.relname`
	rows, err := c.DB.QueryContext(ctx, q, schema, relkind)
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
		out = append(out, dbtypes.Entity{Name: name, Kind: kind, Schema: schema})
	}
	return out, rows.Err()
}

func (c *Conn) listRoutines(schema string) ([]dbtypes.Entity, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `
		SELECT p.proname,
		       p.prokind,
		       pg_catalog.pg_get_function_identity_arguments(p.oid),
		       pg_catalog.format_type(p.prorettype, NULL)
		FROM pg_proc p
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = $1 AND p.prokind IN ('f', 'p')
		ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)`
	rows, err := c.DB.QueryContext(ctx, q, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []dbtypes.Entity
	for rows.Next() {
		var (
			name, prokind, args, ret string
		)
		if err := rows.Scan(&name, &prokind, &args, &ret); err != nil {
			return nil, err
		}
		kind := "function"
		if prokind == "p" {
			kind = "procedure"
		}
		displayName := name
		if args != "" {
			displayName = name + "(" + args + ")"
		}
		extra := fmt.Sprintf("(%s) → %s", args, ret)
		if prokind == "p" {
			extra = fmt.Sprintf("(%s)", args)
		}
		out = append(out, dbtypes.Entity{
			Name:   displayName,
			Kind:   kind,
			Schema: schema,
			Extra:  extra,
		})
	}
	return out, rows.Err()
}

func (c *Conn) listTriggers(schema string) ([]dbtypes.Entity, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `
		SELECT t.tgname, c.relname
		FROM pg_trigger t
		JOIN pg_class c ON c.oid = t.tgrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND NOT t.tgisinternal
		ORDER BY t.tgname`
	rows, err := c.DB.QueryContext(ctx, q, schema)
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
			Name:   name,
			Kind:   "trigger",
			Schema: schema,
			Extra:  "on " + table,
		})
	}
	return out, rows.Err()
}

func (c *Conn) listSequences(schema string) ([]dbtypes.Entity, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `
		SELECT c.relname,
		       COALESCE(s.last_value::text, '')
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		LEFT JOIN pg_sequences s ON s.schemaname = n.nspname AND s.sequencename = c.relname
		WHERE n.nspname = $1 AND c.relkind = 'S'
		ORDER BY c.relname`
	rows, err := c.DB.QueryContext(ctx, q, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []dbtypes.Entity
	for rows.Next() {
		var name, lastVal string
		if err := rows.Scan(&name, &lastVal); err != nil {
			return nil, err
		}
		out = append(out, dbtypes.Entity{
			Name:   name,
			Kind:   "sequence",
			Schema: schema,
			Extra:  lastVal,
		})
	}
	return out, rows.Err()
}

func (c *Conn) listEnums(schema string) ([]dbtypes.Entity, error) {
	ctx, cancel := ctx15()
	defer cancel()
	const q = `
		SELECT t.typname, COUNT(e.enumlabel)::text
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		LEFT JOIN pg_enum e ON e.enumtypid = t.oid
		WHERE n.nspname = $1 AND t.typtype = 'e'
		GROUP BY t.typname
		ORDER BY t.typname`
	rows, err := c.DB.QueryContext(ctx, q, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []dbtypes.Entity
	for rows.Next() {
		var name, count string
		if err := rows.Scan(&name, &count); err != nil {
			return nil, err
		}
		extra := count + " values"
		if count == "1" {
			extra = "1 value"
		}
		out = append(out, dbtypes.Entity{
			Name:   name,
			Kind:   "enum",
			Schema: schema,
			Extra:  extra,
		})
	}
	return out, rows.Err()
}

// EntityDefinition returns the canonical CREATE statement for a non-table entity.
func (c *Conn) EntityDefinition(_ /* database */, schema, kind, name string) (string, error) {
	ctx, cancel := ctx15()
	defer cancel()

	switch kind {
	case "view", "materialized_view":
		relkind := "v"
		if kind == "materialized_view" {
			relkind = "m"
		}
		const q = `
			SELECT pg_get_viewdef(c.oid, true)
			FROM pg_class c
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = $3`
		var def string
		if err := c.DB.QueryRowContext(ctx, q, schema, name, relkind).Scan(&def); err != nil {
			return "", err
		}
		kw := "VIEW"
		if kind == "materialized_view" {
			kw = "MATERIALIZED VIEW"
		}
		return fmt.Sprintf("CREATE %s %s.%s AS\n%s", kw, quoteIdent(schema), quoteIdent(name), def), nil

	case "function", "procedure":
		base, args := splitRoutineName(name)
		const q = `
			SELECT pg_get_functiondef(p.oid)
			FROM pg_proc p
			JOIN pg_namespace n ON n.oid = p.pronamespace
			WHERE n.nspname = $1
			  AND p.proname = $2
			  AND ($3 = '' OR pg_get_function_identity_arguments(p.oid) = $3)
			ORDER BY pg_get_function_identity_arguments(p.oid)
			LIMIT 1`
		var def string
		if err := c.DB.QueryRowContext(ctx, q, schema, base, args).Scan(&def); err != nil {
			return "", err
		}
		return def, nil

	case "trigger":
		const q = `
			SELECT pg_get_triggerdef(t.oid, true)
			FROM pg_trigger t
			JOIN pg_class c ON c.oid = t.tgrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = $1 AND t.tgname = $2 AND NOT t.tgisinternal
			LIMIT 1`
		var def string
		if err := c.DB.QueryRowContext(ctx, q, schema, name).Scan(&def); err != nil {
			return "", err
		}
		return def, nil

	case "sequence":
		const q = `
			SELECT format(
				'CREATE SEQUENCE %I.%I INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s%s',
				schemaname, sequencename,
				increment_by, min_value, max_value, start_value, cache_size,
				CASE WHEN cycle THEN ' CYCLE' ELSE '' END
			)
			FROM pg_sequences
			WHERE schemaname = $1 AND sequencename = $2`
		var def string
		if err := c.DB.QueryRowContext(ctx, q, schema, name).Scan(&def); err != nil {
			return "", err
		}
		return def, nil

	case "enum":
		const q = `
			SELECT 'CREATE TYPE ' || quote_ident(n.nspname) || '.' || quote_ident(t.typname) ||
			       ' AS ENUM (' ||
			       string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) ||
			       ');'
			FROM pg_type t
			JOIN pg_namespace n ON n.oid = t.typnamespace
			JOIN pg_enum e ON e.enumtypid = t.oid
			WHERE n.nspname = $1 AND t.typname = $2
			GROUP BY n.nspname, t.typname`
		var def string
		if err := c.DB.QueryRowContext(ctx, q, schema, name).Scan(&def); err != nil {
			return "", err
		}
		return def, nil

	default:
		return "", fmt.Errorf("unsupported entity kind %q", kind)
	}
}

func splitRoutineName(name string) (base, args string) {
	i := strings.Index(name, "(")
	if i < 0 {
		return name, ""
	}
	base = name[:i]
	args = strings.TrimSuffix(name[i+1:], ")")
	return base, args
}

func quoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}
