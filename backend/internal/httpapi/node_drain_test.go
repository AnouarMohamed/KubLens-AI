package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kubelens-backend/internal/model"
)

func TestDrainNodeForceRequiresAdminAndReason(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	cluster := &drainTrackingCluster{}
	server := newServer(
		cluster,
		nil,
		logger,
		WithWriteActionsEnabled(true),
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "operator-token", User: "operator", Role: "operator"},
				{Token: "admin-token", User: "admin", Role: "admin"},
			},
		}),
	)
	router := server.Router("")

	t.Run("operator cannot force drain", func(t *testing.T) {
		req := httptest.NewRequest(
			http.MethodPost,
			"/api/nodes/node-1/drain",
			strings.NewReader(`{"force":true,"reason":"override disruption budget"}`),
		)
		req.Header.Set("Authorization", "Bearer operator-token")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Fatalf("status code = %d, want 403", rr.Code)
		}
	})

	t.Run("admin force drain requires reason", func(t *testing.T) {
		req := httptest.NewRequest(
			http.MethodPost,
			"/api/nodes/node-1/drain",
			strings.NewReader(`{"force":true,"reason":"   "}`),
		)
		req.Header.Set("Authorization", "Bearer admin-token")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status code = %d, want 400", rr.Code)
		}
	})

	t.Run("admin force drain succeeds and writes override audit", func(t *testing.T) {
		req := httptest.NewRequest(
			http.MethodPost,
			"/api/nodes/node-1/drain",
			strings.NewReader(`{"force":true,"reason":"Emergency host maintenance"}`),
		)
		req.Header.Set("Authorization", "Bearer admin-token")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status code = %d, want 200", rr.Code)
		}
		if cluster.lastDrainForce != true {
			t.Fatal("expected force drain to call cluster with force=true")
		}
		if cluster.drainCalls != 1 {
			t.Fatalf("drain calls = %d, want 1", cluster.drainCalls)
		}

		auditReq := httptest.NewRequest(http.MethodGet, "/api/audit?limit=40", nil)
		auditReq.Header.Set("Authorization", "Bearer admin-token")
		auditResp := httptest.NewRecorder()
		router.ServeHTTP(auditResp, auditReq)
		if auditResp.Code != http.StatusOK {
			t.Fatalf("audit status code = %d, want 200", auditResp.Code)
		}

		var payload model.AuditLogResponse
		if err := json.NewDecoder(auditResp.Body).Decode(&payload); err != nil {
			t.Fatalf("decode audit response: %v", err)
		}

		found := false
		for _, item := range payload.Items {
			if strings.HasPrefix(item.Action, `node.drain.force_override reason="Emergency host maintenance"`) {
				found = true
				break
			}
		}
		if !found {
			t.Fatal("expected force drain override audit entry")
		}
	})

	t.Run("operator non-force drain still succeeds", func(t *testing.T) {
		req := httptest.NewRequest(
			http.MethodPost,
			"/api/nodes/node-1/drain",
			strings.NewReader(`{"force":false}`),
		)
		req.Header.Set("Authorization", "Bearer operator-token")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status code = %d, want 200", rr.Code)
		}
		if cluster.lastDrainForce != false {
			t.Fatal("expected regular drain to call cluster with force=false")
		}
		if cluster.drainCalls != 2 {
			t.Fatalf("drain calls = %d, want 2", cluster.drainCalls)
		}
	})
}

type drainTrackingCluster struct {
	testClusterReader
	drainCalls     int
	lastDrainForce bool
}

func (c *drainTrackingCluster) UncordonNode(_ context.Context, _ string) (model.ActionResult, error) {
	return model.ActionResult{Success: true, Message: "uncordoned"}, nil
}

func (c *drainTrackingCluster) DrainNode(_ context.Context, _ string, force bool) (model.ActionResult, error) {
	c.drainCalls++
	c.lastDrainForce = force
	return model.ActionResult{Success: true, Message: "drained"}, nil
}
