package httpapi

import (
	"errors"
	"strings"
)

type TerminalPolicy struct {
	Enabled            bool
	AllowedPrefixes    []string
	DeniedPrefixes     []string
	KubectlAllowedVerb []string
	MaxOutputBytes     int
}

type terminalRuntimePolicy struct {
	enabled            bool
	allowed            []string
	denied             []string
	kubectlAllowedVerb []string
	maxOutputBytes     int
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
	p.denied = normalizeAllowedPrefixes(config.DeniedPrefixes)
	if len(p.denied) == 0 {
		p.denied = []string{"kubectl delete", "kubectl apply", "kubectl patch", "kubectl exec", "kubectl cp", "kubectl run", "helm upgrade", "helm uninstall", "sh", "bash", "cmd", "powershell"}
	}
	p.kubectlAllowedVerb = normalizeAllowedPrefixes(config.KubectlAllowedVerb)
	if len(p.kubectlAllowedVerb) == 0 {
		p.kubectlAllowedVerb = []string{"get", "describe", "top", "logs", "api-resources", "cluster-info", "version"}
	}
	p.maxOutputBytes = config.MaxOutputBytes
	if p.maxOutputBytes < 1024 {
		p.maxOutputBytes = 20000
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
	normalizedLower := strings.ToLower(normalized)
	if hasAnyPrefix(normalizedLower, p.denied) {
		return errors.New("command prefix is denied by policy")
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
			if root == "kubectl" && len(p.kubectlAllowedVerb) > 0 {
				if len(parts) < 2 {
					return errors.New("kubectl subcommand is required")
				}
				verb := strings.ToLower(strings.TrimSpace(parts[1]))
				if !slicesContains(p.kubectlAllowedVerb, verb) {
					return errors.New("kubectl subcommand is not allowed")
				}
			}
			return nil
		}
	}

	return errors.New("command prefix is not allowed")
}

func hasAnyPrefix(value string, prefixes []string) bool {
	for _, prefix := range prefixes {
		if strings.HasPrefix(value, prefix) {
			return true
		}
	}
	return false
}
