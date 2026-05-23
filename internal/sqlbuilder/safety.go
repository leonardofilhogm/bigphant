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
