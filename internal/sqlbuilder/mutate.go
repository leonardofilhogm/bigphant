package sqlbuilder

import (
	"errors"
	"sort"
	"strings"
)

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
	return BuildInsertDialect(MySQLDialect{}, database, table, values)
}

func BuildInsertDialect(d Dialect, database, table string, values map[string]any) (string, []any, error) {
	if len(values) == 0 {
		return "", nil, errors.New("insert requires at least one value")
	}
	keys := sortedKeys(values)
	cols := make([]string, len(keys))
	placeholders := make([]string, len(keys))
	args := make([]any, len(keys))
	for i, k := range keys {
		cols[i] = d.QuoteIdent(k)
		placeholders[i] = d.Placeholder(i + 1)
		args[i] = values[k]
	}
	sql := "INSERT INTO " + d.Qualified(database, table) +
		" (" + strings.Join(cols, ", ") + ") VALUES (" + strings.Join(placeholders, ", ") + ")"
	return sql, args, nil
}

// BuildUpdate builds an UPDATE keyed by the primary-key map. SET args come
// first, then the WHERE (pk) args.
func BuildUpdate(database, table string, pk, values map[string]any) (string, []any, error) {
	return BuildUpdateDialect(MySQLDialect{}, database, table, pk, values)
}

func BuildUpdateDialect(d Dialect, database, table string, pk, values map[string]any) (string, []any, error) {
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
		setParts[i] = d.QuoteIdent(k) + " = " + d.Placeholder(len(args)+1)
		args = append(args, values[k])
	}

	pkKeys := sortedKeys(pk)
	whereParts := make([]string, len(pkKeys))
	for i, k := range pkKeys {
		whereParts[i] = d.QuoteIdent(k) + " = " + d.Placeholder(len(args)+1)
		args = append(args, pk[k])
	}

	sql := "UPDATE " + d.Qualified(database, table) +
		" SET " + strings.Join(setParts, ", ") +
		" WHERE " + strings.Join(whereParts, " AND ")
	return sql, args, nil
}

// BuildDelete builds a DELETE matching any of the given primary-key maps,
// e.g. WHERE (`id` = ?) OR (`id` = ?).
func BuildDelete(database, table string, pks []map[string]any) (string, []any, error) {
	return BuildDeleteDialect(MySQLDialect{}, database, table, pks)
}

func BuildDeleteDialect(d Dialect, database, table string, pks []map[string]any) (string, []any, error) {
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
			parts[i] = d.QuoteIdent(k) + " = " + d.Placeholder(len(args)+1)
			args = append(args, pk[k])
		}
		groups = append(groups, "("+strings.Join(parts, " AND ")+")")
	}
	sql := "DELETE FROM " + d.Qualified(database, table) +
		" WHERE " + strings.Join(groups, " OR ")
	return sql, args, nil
}
