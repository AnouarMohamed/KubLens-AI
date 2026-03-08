package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"kubelens-backend/internal/model"
)

func TestAuthRequiresTokenWhenEnabled(t *testing.T) {
	router := newAuthTestServer().Router("")

	req := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status code = %d, want 401", rr.Code)
	}
}

func TestAuthEnforcesRoles(t *testing.T) {
	router := newAuthTestServer().Router("")

	viewerRead := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	viewerRead.Header.Set("Authorization", "Bearer viewer-token")
	viewerReadResp := httptest.NewRecorder()
	router.ServeHTTP(viewerReadResp, viewerRead)
	if viewerReadResp.Code != http.StatusOK {
		t.Fatalf("viewer read status = %d, want 200", viewerReadResp.Code)
	}

	viewerWrite := httptest.NewRequest(http.MethodPost, "/api/pods", strings.NewReader(`{"namespace":"default","name":"demo","image":"nginx:latest"}`))
	viewerWrite.Header.Set("Authorization", "Bearer viewer-token")
	viewerWrite.Header.Set("Content-Type", "application/json")
	viewerWriteResp := httptest.NewRecorder()
	router.ServeHTTP(viewerWriteResp, viewerWrite)
	if viewerWriteResp.Code != http.StatusForbidden {
		t.Fatalf("viewer write status = %d, want 403", viewerWriteResp.Code)
	}

	operatorWrite := httptest.NewRequest(http.MethodPost, "/api/pods", strings.NewReader(`{"namespace":"default","name":"demo","image":"nginx:latest"}`))
	operatorWrite.Header.Set("Authorization", "Bearer operator-token")
	operatorWrite.Header.Set("Content-Type", "application/json")
	operatorWriteResp := httptest.NewRecorder()
	router.ServeHTTP(operatorWriteResp, operatorWrite)
	if operatorWriteResp.Code != http.StatusOK {
		t.Fatalf("operator write status = %d, want 200", operatorWriteResp.Code)
	}

	operatorTerminal := httptest.NewRequest(http.MethodPost, "/api/terminal/exec", strings.NewReader(`{"command":"echo ok"}`))
	operatorTerminal.Header.Set("Authorization", "Bearer operator-token")
	operatorTerminal.Header.Set("Content-Type", "application/json")
	operatorTerminalResp := httptest.NewRecorder()
	router.ServeHTTP(operatorTerminalResp, operatorTerminal)
	if operatorTerminalResp.Code != http.StatusForbidden {
		t.Fatalf("operator terminal status = %d, want 403", operatorTerminalResp.Code)
	}

	adminTerminal := httptest.NewRequest(http.MethodPost, "/api/terminal/exec", strings.NewReader(`{"command":"echo ok"}`))
	adminTerminal.Header.Set("Authorization", "Bearer admin-token")
	adminTerminal.Header.Set("Content-Type", "application/json")
	adminTerminalResp := httptest.NewRecorder()
	router.ServeHTTP(adminTerminalResp, adminTerminal)
	if adminTerminalResp.Code != http.StatusOK {
		t.Fatalf("admin terminal status = %d, want 200", adminTerminalResp.Code)
	}
}

func TestAuditEndpointIncludesAuthFailures(t *testing.T) {
	router := newAuthTestServer().Router("")

	okReq := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	okReq.Header.Set("Authorization", "Bearer viewer-token")
	okResp := httptest.NewRecorder()
	router.ServeHTTP(okResp, okReq)
	if okResp.Code != http.StatusOK {
		t.Fatalf("read status = %d, want 200", okResp.Code)
	}

	failReq := httptest.NewRequest(http.MethodPost, "/api/pods", strings.NewReader(`{"namespace":"default","name":"demo","image":"nginx:latest"}`))
	failReq.Header.Set("Authorization", "Bearer viewer-token")
	failReq.Header.Set("Content-Type", "application/json")
	failResp := httptest.NewRecorder()
	router.ServeHTTP(failResp, failReq)
	if failResp.Code != http.StatusForbidden {
		t.Fatalf("write status = %d, want 403", failResp.Code)
	}

	auditReq := httptest.NewRequest(http.MethodGet, "/api/audit?limit=20", nil)
	auditReq.Header.Set("Authorization", "Bearer admin-token")
	auditResp := httptest.NewRecorder()
	router.ServeHTTP(auditResp, auditReq)
	if auditResp.Code != http.StatusOK {
		t.Fatalf("audit status = %d, want 200", auditResp.Code)
	}

	var payload map[string]any
	if err := json.NewDecoder(auditResp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode audit payload: %v", err)
	}
	itemsRaw, ok := payload["items"].([]any)
	if !ok || len(itemsRaw) == 0 {
		t.Fatal("expected audit items")
	}
}

func TestAuthLoginCreatesCookieSession(t *testing.T) {
	router := newAuthTestServer().Router("")

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"token":"viewer-token"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp := httptest.NewRecorder()
	router.ServeHTTP(loginResp, loginReq)
	if loginResp.Code != http.StatusOK {
		t.Fatalf("login status = %d, want 200", loginResp.Code)
	}

	cookies := loginResp.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected auth cookie")
	}

	readReq := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	readReq.AddCookie(cookies[0])
	readResp := httptest.NewRecorder()
	router.ServeHTTP(readResp, readReq)
	if readResp.Code != http.StatusOK {
		t.Fatalf("cookie-auth read status = %d, want 200", readResp.Code)
	}
}

func TestAuthBlocksHeaderTokenWhenDisabled(t *testing.T) {
	router := newAuthTestServer().Router("")

	req := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	req.Header.Set("X-Auth-Token", "viewer-token")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status code = %d, want 401", rr.Code)
	}
}

func TestAuthAllowsHeaderTokenWhenEnabled(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithAuth(AuthConfig{
			Enabled:          true,
			AllowHeaderToken: true,
			Tokens: []AuthToken{
				{Token: "viewer-token", User: "viewer", Role: "viewer"},
			},
		}),
	)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	req.Header.Set("X-Auth-Token", "viewer-token")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", rr.Code)
	}
}

func TestCookieMutationRequiresSameOrigin(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithWriteActionsEnabled(true),
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "operator-token", User: "operator", Role: "operator"},
			},
		}),
	)
	router := server.Router("")

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"token":"operator-token"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp := httptest.NewRecorder()
	router.ServeHTTP(loginResp, loginReq)
	if loginResp.Code != http.StatusOK {
		t.Fatalf("login status = %d, want 200", loginResp.Code)
	}
	cookies := loginResp.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected auth cookie")
	}

	mutateReq := httptest.NewRequest(http.MethodPost, "/api/pods", strings.NewReader(`{"namespace":"default","name":"demo","image":"nginx:latest"}`))
	mutateReq.Header.Set("Content-Type", "application/json")
	mutateReq.Header.Set("Origin", "https://evil.example")
	mutateReq.AddCookie(cookies[0])
	mutateResp := httptest.NewRecorder()
	router.ServeHTTP(mutateResp, mutateReq)
	if mutateResp.Code != http.StatusForbidden {
		t.Fatalf("mutation status = %d, want 403", mutateResp.Code)
	}
}

func TestCookieMutationAllowsSameOrigin(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithWriteActionsEnabled(true),
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "operator-token", User: "operator", Role: "operator"},
			},
		}),
	)
	router := server.Router("")

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"token":"operator-token"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp := httptest.NewRecorder()
	router.ServeHTTP(loginResp, loginReq)
	if loginResp.Code != http.StatusOK {
		t.Fatalf("login status = %d, want 200", loginResp.Code)
	}
	cookies := loginResp.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected auth cookie")
	}

	mutateReq := httptest.NewRequest(http.MethodPost, "/api/pods", strings.NewReader(`{"namespace":"default","name":"demo","image":"nginx:latest"}`))
	mutateReq.Host = "example.com"
	mutateReq.Header.Set("Content-Type", "application/json")
	mutateReq.Header.Set("Origin", "https://example.com")
	mutateReq.AddCookie(cookies[0])
	mutateResp := httptest.NewRecorder()
	router.ServeHTTP(mutateResp, mutateReq)
	if mutateResp.Code != http.StatusOK {
		t.Fatalf("mutation status = %d, want 200", mutateResp.Code)
	}
}

func TestCookieMutationRejectsMissingOriginAndReferer(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithWriteActionsEnabled(true),
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "operator-token", User: "operator", Role: "operator"},
			},
		}),
	)
	router := server.Router("")

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"token":"operator-token"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp := httptest.NewRecorder()
	router.ServeHTTP(loginResp, loginReq)
	if loginResp.Code != http.StatusOK {
		t.Fatalf("login status = %d, want 200", loginResp.Code)
	}
	cookies := loginResp.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected auth cookie")
	}

	mutateReq := httptest.NewRequest(http.MethodPost, "/api/pods", strings.NewReader(`{"namespace":"default","name":"demo","image":"nginx:latest"}`))
	mutateReq.Header.Set("Content-Type", "application/json")
	mutateReq.AddCookie(cookies[0])
	mutateResp := httptest.NewRecorder()
	router.ServeHTTP(mutateResp, mutateReq)

	if mutateResp.Code != http.StatusForbidden {
		t.Fatalf("mutation status = %d, want 403", mutateResp.Code)
	}
}

func TestStreamRejectsQueryTokenAuthentication(t *testing.T) {
	router := newAuthTestServer().Router("")

	req := httptest.NewRequest(http.MethodGet, "/api/stream?token=viewer-token", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status code = %d, want 401", rr.Code)
	}
}

func TestHealthEndpointsBypassAuth(t *testing.T) {
	router := newAuthTestServer().Router("")

	for _, path := range []string{"/api/healthz", "/api/readyz", "/api/openapi.yaml"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("%s status code = %d, want 200", path, rr.Code)
		}
	}
}

func TestAuditCapturesMutatingActions(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithWriteActionsEnabled(true),
		WithTerminalPolicy(TerminalPolicy{Enabled: true}),
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "admin-token", User: "admin", Role: "admin"},
			},
		}),
	)
	router := server.Router("")

	requests := []struct {
		method string
		path   string
		body   string
	}{
		{method: http.MethodPost, path: "/api/pods", body: `{"namespace":"default","name":"demo","image":"nginx:latest"}`},
		{method: http.MethodPost, path: "/api/pods/default/demo/restart"},
		{method: http.MethodDelete, path: "/api/pods/default/demo"},
		{method: http.MethodPost, path: "/api/nodes/node-1/cordon"},
		{method: http.MethodPut, path: "/api/resources/deployments/default/demo/yaml", body: `{"yaml":"apiVersion: apps/v1\nkind: Deployment"}`},
		{method: http.MethodPost, path: "/api/resources/deployments/default/demo/scale", body: `{"replicas":2}`},
		{method: http.MethodPost, path: "/api/resources/deployments/default/demo/restart"},
		{method: http.MethodPost, path: "/api/resources/deployments/default/demo/rollback"},
		{method: http.MethodPost, path: "/api/terminal/exec", body: `{"command":"echo ok"}`},
	}

	for _, item := range requests {
		req := httptest.NewRequest(item.method, item.path, strings.NewReader(item.body))
		req.Header.Set("Authorization", "Bearer admin-token")
		if item.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("%s %s status = %d, want 200", item.method, item.path, rr.Code)
		}
	}

	auditReq := httptest.NewRequest(http.MethodGet, "/api/audit?limit=100", nil)
	auditReq.Header.Set("Authorization", "Bearer admin-token")
	auditResp := httptest.NewRecorder()
	router.ServeHTTP(auditResp, auditReq)
	if auditResp.Code != http.StatusOK {
		t.Fatalf("audit status = %d, want 200", auditResp.Code)
	}

	var payload model.AuditLogResponse
	if err := json.NewDecoder(auditResp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode audit payload: %v", err)
	}

	actions := make([]string, 0, len(payload.Items))
	for _, item := range payload.Items {
		if item.Success {
			actions = append(actions, item.Action)
		}
	}

	expected := []string{
		"pod.create",
		"pod.restart",
		"pod.delete",
		"node.cordon",
		"resource.apply",
		"resource.scale",
		"resource.restart",
		"resource.rollback",
		"terminal.exec",
	}
	for _, action := range expected {
		if !slices.Contains(actions, action) {
			t.Fatalf("expected audit action %q in successful entries: %v", action, actions)
		}
	}
}

func TestAuditSanitizesClientIPAndDoesNotLeakTokens(t *testing.T) {
	router := newAuthTestServer().Router("")

	unauthorized := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	unauthorized.RemoteAddr = "10.9.0.10:9876"
	unauthorized.Header.Set("Authorization", "Bearer super-secret-token")
	unauthorizedResp := httptest.NewRecorder()
	router.ServeHTTP(unauthorizedResp, unauthorized)
	if unauthorizedResp.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d, want 401", unauthorizedResp.Code)
	}

	auditReq := httptest.NewRequest(http.MethodGet, "/api/audit?limit=20", nil)
	auditReq.Header.Set("Authorization", "Bearer admin-token")
	auditResp := httptest.NewRecorder()
	router.ServeHTTP(auditResp, auditReq)
	if auditResp.Code != http.StatusOK {
		t.Fatalf("audit status = %d, want 200", auditResp.Code)
	}

	var payload model.AuditLogResponse
	if err := json.NewDecoder(auditResp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode audit payload: %v", err)
	}
	if len(payload.Items) == 0 {
		t.Fatal("expected audit items")
	}

	found := false
	for _, item := range payload.Items {
		if item.Path == "/api/pods" && item.Action == "unauthenticated" {
			found = true
			if item.ClientIP != "10.9.0.10" {
				t.Fatalf("client ip = %q, want 10.9.0.10", item.ClientIP)
			}
			serialized, _ := json.Marshal(item)
			if strings.Contains(string(serialized), "super-secret-token") {
				t.Fatalf("audit entry leaked token: %s", string(serialized))
			}
			break
		}
	}
	if !found {
		t.Fatal("expected unauthorized /api/pods audit entry")
	}
}

func newAuthTestServer() *Server {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	return newServer(
		testClusterReader{},
		nil,
		logger,
		WithWriteActionsEnabled(true),
		WithTerminalPolicy(TerminalPolicy{Enabled: true}),
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "viewer-token", User: "viewer", Role: "viewer"},
				{Token: "operator-token", User: "operator", Role: "operator"},
				{Token: "admin-token", User: "admin", Role: "admin"},
			},
		}),
	)
}
