package auth

import (
	"net/http"
	"strings"
)

type Role int

const (
	RoleViewer Role = iota + 1
	RoleOperator
	RoleAdmin
)

func ParseRole(raw string) Role {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "admin":
		return RoleAdmin
	case "operator":
		return RoleOperator
	default:
		return RoleViewer
	}
}

func RoleLabel(role Role) string {
	switch role {
	case RoleAdmin:
		return "admin"
	case RoleOperator:
		return "operator"
	default:
		return "viewer"
	}
}

func PermissionsForRole(role Role) []string {
	switch role {
	case RoleAdmin, RoleOperator:
		return []string{"read", "assist", "stream", "write"}
	default:
		return []string{"read", "assist", "stream"}
	}
}

func RequiredRole(method, path string) Role {
	cleanMethod := strings.ToUpper(strings.TrimSpace(method))

	switch {
	case cleanMethod == http.MethodPost && path == "/api/assistant":
		return RoleViewer
	case cleanMethod == http.MethodPost && path == "/api/clusters/select":
		return RoleViewer
	case cleanMethod == http.MethodGet || cleanMethod == http.MethodHead:
		return RoleViewer
	case cleanMethod == http.MethodPost || cleanMethod == http.MethodPut || cleanMethod == http.MethodPatch || cleanMethod == http.MethodDelete:
		return RoleOperator
	default:
		return RoleViewer
	}
}
