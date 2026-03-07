package httpapi

import (
	"errors"
	"strings"
)

type TerminalPolicy struct {
	Enabled         bool
	AllowedPrefixes []string
}

type terminalRuntimePolicy struct {
	enabled bool
	allowed []string
}

func WithTerminalPolicy(config TerminalPolicy) Option {
	return func(s *Server) {
		s.terminal.configure(config)
	}
}

func (p *terminalRuntimePolicy) configure(config TerminalPolicy) {
	p.enabled = config.Enabled
	p.allowed = normalizeAllowedPrefixes(config.AllowedPrefixes)
	if len(p.allowed) == 0 {
		p.allowed = []string{"kubectl", "helm", "kustomize", "echo", "pwd", "ls", "dir"}
	}
}

func normalizeAllowedPrefixes(raw []string) []string {
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		normalized := strings.ToLower(strings.TrimSpace(item))
		if normalized == "" {
			continue
		}
		if !slicesContains(out, normalized) {
			out = append(out, normalized)
		}
	}
	return out
}

func slicesContains(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func (p *terminalRuntimePolicy) validateCommand(command string) error {
	if !p.enabled {
		return errors.New("terminal execution is disabled")
	}

	normalized := strings.TrimSpace(command)
	if normalized == "" {
		return errors.New("command is required")
	}
	forbiddenTokens := []string{"&&", "||", ";", "|", ">", "<", "`", "$(", "\n", "\r"}
	for _, token := range forbiddenTokens {
		if strings.Contains(normalized, token) {
			return errors.New("command contains forbidden shell operators")
		}
	}

	parts := strings.Fields(normalized)
	if len(parts) == 0 {
		return errors.New("command is required")
	}

	root := strings.ToLower(strings.TrimSpace(parts[0]))
	root = strings.TrimSuffix(root, ".exe")
	for _, allowed := range p.allowed {
		if root == allowed {
			return nil
		}
	}

	return errors.New("command prefix is not allowed")
}
