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

// quoteIdent backtick-quotes an identifier, escaping embedded backticks.
func quoteIdent(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

var valueComparators = map[string]bool{
	"=": true, "!=": true, ">": true, "<": true, ">=": true, "<=": true, "LIKE": true,
}

var nullComparators = map[string]bool{
	"IS NULL": true, "IS NOT NULL": true,
}

// BuildSelect returns the SQL and bound args for a table-browse query.
// LIMIT/OFFSET are validated integers and inlined; all user values are bound.
func BuildSelect(req FetchRowsRequest) (string, []any, error) {
	if req.Table == "" {
		return "", nil, fmt.Errorf("table is required")
	}

	var sb strings.Builder
	sb.WriteString("SELECT * FROM ")
	if req.Database != "" {
		sb.WriteString(quoteIdent(req.Database))
		sb.WriteByte('.')
	}
	sb.WriteString(quoteIdent(req.Table))

	var args []any
	clauses := make([]string, 0, len(req.Filters))
	for _, f := range req.Filters {
		if f.Column == "" {
			continue
		}
		col := quoteIdent(f.Column)
		switch {
		case nullComparators[f.Comparator]:
			clauses = append(clauses, col+" "+f.Comparator)
		case valueComparators[f.Comparator]:
			clauses = append(clauses, col+" "+f.Comparator+" ?")
			args = append(args, f.Value)
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
		sb.WriteString(quoteIdent(req.OrderBy))
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
