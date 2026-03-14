package httpapi

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

type trustedProxyMatcher struct {
	prefixes []netip.Prefix
}

func WithTrustedProxyCIDRs(cidrs []string) Option {
	return func(s *Server) {
		s.trustedProxies.configure(cidrs)
	}
}

func (m *trustedProxyMatcher) configure(cidrs []string) {
	if len(cidrs) == 0 {
		m.prefixes = nil
		return
	}

	prefixes := make([]netip.Prefix, 0, len(cidrs))
	for _, raw := range cidrs {
		prefix, err := netip.ParsePrefix(strings.TrimSpace(raw))
		if err != nil {
			continue
		}
		prefixes = append(prefixes, prefix)
	}
	m.prefixes = prefixes
}

func (m *trustedProxyMatcher) isTrusted(addr netip.Addr) bool {
	if len(m.prefixes) == 0 {
		return false
	}
	normalized := addr.Unmap()
	for _, prefix := range m.prefixes {
		if prefix.Contains(normalized) {
			return true
		}
	}
	return false
}

func (s *Server) clientIPFromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}

	direct := sanitizeClientIP(r.RemoteAddr)
	if direct == "" {
		return ""
	}

	directAddr, ok := parseIPAddress(direct)
	if !ok || !s.trustedProxies.isTrusted(directAddr) {
		return direct
	}

	forwarded := parseForwardedClientIP(r.Header.Get("X-Forwarded-For"), s.trustedProxies)
	if forwarded != "" {
		return forwarded
	}

	return direct
}

func parseForwardedClientIP(raw string, matcher trustedProxyMatcher) string {
	parts := strings.Split(raw, ",")
	parsed := make([]netip.Addr, 0, len(parts))
	for _, part := range parts {
		addr, ok := parseIPAddress(strings.TrimSpace(part))
		if !ok {
			continue
		}
		parsed = append(parsed, addr)
	}

	if len(parsed) == 0 {
		return ""
	}

	for i := len(parsed) - 1; i >= 0; i-- {
		if !matcher.isTrusted(parsed[i]) {
			return parsed[i].String()
		}
	}

	// All forwarded hops are trusted; fall back to left-most source.
	return parsed[0].String()
}

func parseIPAddress(raw string) (netip.Addr, bool) {
	trimmed := strings.Trim(strings.TrimSpace(raw), "\"")
	if trimmed == "" {
		return netip.Addr{}, false
	}

	if addr, err := netip.ParseAddr(trimmed); err == nil {
		return addr.Unmap(), true
	}

	host, _, err := net.SplitHostPort(trimmed)
	if err == nil {
		if addr, err := netip.ParseAddr(host); err == nil {
			return addr.Unmap(), true
		}
	}

	return netip.Addr{}, false
}
