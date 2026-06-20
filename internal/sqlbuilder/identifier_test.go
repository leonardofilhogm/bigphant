package sqlbuilder

import "testing"

func TestValidateIdentifier(t *testing.T) {
	if err := ValidateIdentifier("users"); err != nil {
		t.Fatal(err)
	}
	if err := ValidateIdentifier(""); err == nil {
		t.Fatal("expected error for empty")
	}
	if err := ValidateIdentifier("bad;name"); err == nil {
		t.Fatal("expected error for semicolon")
	}
}

func TestQuoteStringLiteral(t *testing.T) {
	got := QuoteStringLiteral("it's")
	if got != "'it''s'" {
		t.Fatalf("got %q", got)
	}
}
