package sqlbuilder

import (
	"fmt"
	"regexp"
	"strings"
)

var reIdentifier = regexp.MustCompile(`^[\w]+$`)

// ValidateIdentifier rejects empty or injection-prone SQL identifiers.
func ValidateIdentifier(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("identifier is required")
	}
	if strings.Contains(name, ";") || strings.Contains(name, "--") {
		return fmt.Errorf("invalid identifier")
	}
	if !reIdentifier.MatchString(name) {
		return fmt.Errorf("invalid identifier: %q", name)
	}
	return nil
}

// QuoteStringLiteral returns a single-quoted SQL string literal with escaping.
func QuoteStringLiteral(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
