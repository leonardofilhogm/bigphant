package dbtypes

import (
	"encoding/json"
	"testing"
)

func TestParseCharset(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"utf8mb4_unicode_ci", "utf8mb4"},
		{"latin1_swedish_ci", "latin1"},
		{"en_US.utf8", "utf8"},
		{"", ""},
		{"C", "C"},
	}
	for _, tc := range tests {
		if got := ParseCharset(tc.in); got != tc.want {
			t.Errorf("ParseCharset(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestTableSummaryJSONRoundTrip(t *testing.T) {
	// Locks JSON field names used by the Wails bridge / frontend types.
	const payload = `{"name":"t","row_count":1,"engine":"InnoDB","size_bytes":100,"data_size_bytes":80,"index_size_bytes":20,"charset":"utf8mb4"}`
	var s TableSummary
	if err := json.Unmarshal([]byte(payload), &s); err != nil {
		t.Fatal(err)
	}
	if s.Name != "t" || s.Charset != "utf8mb4" || s.DataSizeBytes != 80 {
		t.Fatalf("unexpected: %+v", s)
	}
}
