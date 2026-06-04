package sqlbuilder

import (
	"regexp"
	"strings"
)

var (
	reWhere       = regexp.MustCompile(`(?i)\bwhere\b`)
	reAlterDropCol = regexp.MustCompile("(?i)\\bdrop\\s+(column\\b|`)")
)

var readOnlyKeywords = map[string]bool{
	"select": true, "show": true, "describe": true, "desc": true,
	"explain": true, "with": true,
}

// FirstKeyword returns the lowercased leading keyword of a statement.
func FirstKeyword(sql string) string {
	fields := strings.Fields(strings.TrimSpace(sql))
	if len(fields) == 0 {
		return ""
	}
	return strings.ToLower(fields[0])
}

// IsReadOnly reports whether a statement only reads (safe under a read-only
// connection).
func IsReadOnly(sql string) bool {
	return readOnlyKeywords[FirstKeyword(sql)]
}

// Classify reports whether a statement is destructive, per docs/prd.md §9:
//  1. UPDATE/DELETE with no WHERE
//  2. TRUNCATE
//  3. DROP (any)
//  4. ALTER TABLE ... DROP COLUMN
//
// When in doubt the classifier errs toward "destructive".
// IsSchemaDDL reports statements that change schema objects (§8.1 ExecuteRaw gate).
func IsSchemaDDL(sql string) bool {
	switch FirstKeyword(sql) {
	case "create", "alter", "drop", "rename", "truncate":
		return true
	}
	return false
}

// ClassifyAlter reports whether any op in a structured ALTER request is destructive.
func ClassifyAlter(req AlterTableRequest) bool {
	for _, op := range req.Ops {
		switch op.Kind {
		case "drop_column", "drop_index", "drop_primary_key",
			"drop_constraint", "drop_foreign_key", "drop_default":
			return true
		case "modify_column":
			if op.Column != nil && !op.Column.Nullable {
				return true
			}
		}
	}
	return false
}

func Classify(sql string) bool {
	lower := strings.ToLower(sql)
	switch FirstKeyword(sql) {
	case "update", "delete":
		return !reWhere.MatchString(lower)
	case "truncate", "drop":
		return true
	case "alter":
		return reAlterDropCol.MatchString(lower)
	}
	return false
}
