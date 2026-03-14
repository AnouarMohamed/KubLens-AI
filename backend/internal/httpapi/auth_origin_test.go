package httpapi

import (
	"net/http"
	"testing"
)

func TestHostMatchesPortAware(t *testing.T) {
	tests := []struct {
		name      string
		candidate string
		expected  string
		want      bool
	}{
		{name: "exact host and port", candidate: "api.example.com:3000", expected: "api.example.com:3000", want: true},
		{name: "candidate has port expected host-only", candidate: "ops.example.com:8443", expected: "ops.example.com", want: true},
		{name: "candidate host-only expected has port", candidate: "ops.example.com", expected: "ops.example.com:443", want: true},
		{name: "different ports", candidate: "ops.example.com:8443", expected: "ops.example.com:3000", want: false},
		{name: "different host", candidate: "ops.example.com:8443", expected: "api.example.com:8443", want: false},
		{name: "ipv6 host-only match", candidate: "[::1]:3000", expected: "[::1]", want: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := hostMatches(tc.candidate, tc.expected); got != tc.want {
				t.Fatalf("hostMatches(%q, %q) = %t, want %t", tc.candidate, tc.expected, got, tc.want)
			}
		})
	}
}

func TestValidateCSRFSameOriginTrustedDomainAllowsCustomPort(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "http://api.example.com:3000/api/pods", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Host = "api.example.com:3000"
	req.Header.Set("Origin", "https://ops.example.com:8443")

	if err := validateCSRFSameOrigin(req, []string{"ops.example.com"}); err != nil {
		t.Fatalf("validateCSRFSameOrigin() error = %v, want nil", err)
	}
}
