// Package sqlbuilder generates safe, parameterized SQL on the Go side. The
// frontend never builds CRUD SQL (docs/prd.md §5): values go through ?
// placeholders and identifiers are backtick-quoted/escaped — never
// fmt.Sprintf'd from user values.
package sqlbuilder

import (
	"fmt"
	"strings"
)

// Filter is one WHERE condition from the table-view filter bar.
type Filter struct {
	Column     string `json:"column"`
	Comparator string `json:"comparator"`
	Value      string `json:"value"` // ignored for IS NULL / IS NOT NULL
}

// FetchRowsRequest describes a paginated table-browse query.
type FetchRowsRequest struct {
	Database string   `json:"database"`
	Table    string   `json:"table"`
	Filters  []Filter `json:"filters"`
	Limit    int      `json:"limit"`
	Offset   int      `json:"offset"`
	OrderBy  string   `json:"order_by"`
	OrderDir string   `json:"order_dir"`
}

// DefaultLimit is the table-browse page size (docs/prd.md §5).
const DefaultLimit = 300

var valueComparators = map[string]bool{
	"=": true, "!=": true, "<>": true, ">": true, "<": true, ">=": true, "<=": true,
	"LIKE": true, "NOT LIKE": true,
}

var nullComparators = map[string]bool{
	"IS NULL": true, "IS NOT NULL": true,
}

// IN / NOT IN take a comma-separated list; BETWEEN / NOT BETWEEN take exactly
// two comma-separated bounds. Both bind every element as a placeholder.
var inComparators = map[string]bool{
	"IN": true, "NOT IN": true,
}

var betweenComparators = map[string]bool{
	"BETWEEN": true, "NOT BETWEEN": true,
}

// splitList parses a comma-separated value into trimmed, non-empty elements.
// Note (PoC limitation): values that themselves contain a comma can't be
// expressed this way — acceptable for the table-browse filter bar.
func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// BuildSelect returns the SQL and bound args for a table-browse query.
// LIMIT/OFFSET are validated integers and inlined; all user values are bound.
func BuildSelect(req FetchRowsRequest) (string, []any, error) {
	return BuildSelectDialect(MySQLDialect{}, req)
}

func BuildSelectDialect(d Dialect, req FetchRowsRequest) (string, []any, error) {
	if req.Table == "" {
		return "", nil, fmt.Errorf("table is required")
	}

	var sb strings.Builder
	sb.WriteString("SELECT * FROM ")
	sb.WriteString(d.Qualified(req.Database, req.Table))

	var args []any
	clauses := make([]string, 0, len(req.Filters))
	for _, f := range req.Filters {
		if f.Column == "" {
			continue
		}
		col := d.QuoteIdent(f.Column)
		switch {
		case nullComparators[f.Comparator]:
			clauses = append(clauses, col+" "+f.Comparator)
		case valueComparators[f.Comparator]:
			clauses = append(clauses, col+" "+f.Comparator+" "+d.Placeholder(len(args)+1))
			args = append(args, f.Value)
		case inComparators[f.Comparator]:
			items := splitList(f.Value)
			if len(items) == 0 {
				continue // empty list → no-op, skip the clause
			}
			placeholders := make([]string, len(items))
			for i, v := range items {
				placeholders[i] = d.Placeholder(len(args) + 1)
				args = append(args, v)
			}
			clauses = append(clauses, col+" "+f.Comparator+" ("+strings.Join(placeholders, ", ")+")")
		case betweenComparators[f.Comparator]:
			items := splitList(f.Value)
			if len(items) != 2 {
				return "", nil, fmt.Errorf("%s requires two values separated by a comma", f.Comparator)
			}
			lo := d.Placeholder(len(args) + 1)
			args = append(args, items[0])
			hi := d.Placeholder(len(args) + 1)
			args = append(args, items[1])
			clauses = append(clauses, col+" "+f.Comparator+" "+lo+" AND "+hi)
		default:
			return "", nil, fmt.Errorf("unsupported comparator: %q", f.Comparator)
		}
	}
	if len(clauses) > 0 {
		sb.WriteString(" WHERE ")
		sb.WriteString(strings.Join(clauses, " AND "))
	}

	if req.OrderBy != "" {
		dir := "ASC"
		if strings.EqualFold(req.OrderDir, "DESC") {
			dir = "DESC"
		}
		sb.WriteString(" ORDER BY ")
		sb.WriteString(d.QuoteIdent(req.OrderBy))
		sb.WriteByte(' ')
		sb.WriteString(dir)
	}

	limit := req.Limit
	if limit <= 0 {
		limit = DefaultLimit
	}
	offset := req.Offset
	if offset < 0 {
		offset = 0
	}
	sb.WriteString(fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset))

	return sb.String(), args, nil
}
