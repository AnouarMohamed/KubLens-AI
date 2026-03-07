package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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

func TestStreamRejectsQueryTokenAuthentication(t *testing.T) {
	router := newAuthTestServer().Router("")

	req := httptest.NewRequest(http.MethodGet, "/api/stream?token=viewer-token", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status code = %d, want 401", rr.Code)
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
