package sqlbuilder

import (
	"errors"
	"sort"
	"strings"
)

// qualified returns `db`.`table` (or just `table` when db is empty).
func qualified(database, table string) string {
	if database == "" {
		return quoteIdent(table)
	}
	return quoteIdent(database) + "." + quoteIdent(table)
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys) // deterministic column order
	return keys
}

// BuildInsert builds an INSERT for the given column→value map.
func BuildInsert(database, table string, values map[string]any) (string, []any, error) {
	if len(values) == 0 {
		return "", nil, errors.New("insert requires at least one value")
	}
	keys := sortedKeys(values)
	cols := make([]string, len(keys))
	placeholders := make([]string, len(keys))
	args := make([]any, len(keys))
	for i, k := range keys {
		cols[i] = quoteIdent(k)
		placeholders[i] = "?"
		args[i] = values[k]
	}
	sql := "INSERT INTO " + qualified(database, table) +
		" (" + strings.Join(cols, ", ") + ") VALUES (" + strings.Join(placeholders, ", ") + ")"
	return sql, args, nil
}

// BuildUpdate builds an UPDATE keyed by the primary-key map. SET args come
// first, then the WHERE (pk) args.
func BuildUpdate(database, table string, pk, values map[string]any) (string, []any, error) {
	if len(values) == 0 {
		return "", nil, errors.New("update requires at least one value")
	}
	if len(pk) == 0 {
		return "", nil, errors.New("update requires a primary key")
	}

	setKeys := sortedKeys(values)
	setParts := make([]string, len(setKeys))
	args := make([]any, 0, len(values)+len(pk))
	for i, k := range setKeys {
		setParts[i] = quoteIdent(k) + " = ?"
		args = append(args, values[k])
	}

	pkKeys := sortedKeys(pk)
	whereParts := make([]string, len(pkKeys))
	for i, k := range pkKeys {
		whereParts[i] = quoteIdent(k) + " = ?"
		args = append(args, pk[k])
	}

	sql := "UPDATE " + qualified(database, table) +
		" SET " + strings.Join(setParts, ", ") +
		" WHERE " + strings.Join(whereParts, " AND ")
	return sql, args, nil
}

// BuildDelete builds a DELETE matching any of the given primary-key maps,
// e.g. WHERE (`id` = ?) OR (`id` = ?).
func BuildDelete(database, table string, pks []map[string]any) (string, []any, error) {
	if len(pks) == 0 {
		return "", nil, errors.New("delete requires at least one primary key")
	}
	groups := make([]string, 0, len(pks))
	args := make([]any, 0, len(pks))
	for _, pk := range pks {
		if len(pk) == 0 {
			return "", nil, errors.New("delete requires a non-empty primary key")
		}
		keys := sortedKeys(pk)
		parts := make([]string, len(keys))
		for i, k := range keys {
			parts[i] = quoteIdent(k) + " = ?"
			args = append(args, pk[k])
		}
		groups = append(groups, "("+strings.Join(parts, " AND ")+")")
	}
	sql := "DELETE FROM " + qualified(database, table) +
		" WHERE " + strings.Join(groups, " OR ")
	return sql, args, nil
}
