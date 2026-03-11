package riskguard

import (
	"strings"
	"testing"

	"kubelens-backend/internal/model"
)

func TestAnalyzeParseError(t *testing.T) {
	report := Analyze("kind: Deployment\nmetadata:\n  name: bad\n  namespace: default\nspec: [", nil, nil)
	if report.Score != 30 {
		t.Fatalf("score = %d, want 30", report.Score)
	}
	if len(report.Checks) != 1 || report.Checks[0].Passed {
		t.Fatalf("unexpected parse checks: %#v", report.Checks)
	}
	if !strings.Contains(strings.ToLower(report.Checks[0].Detail), "manifest could not be parsed") {
		t.Fatalf("unexpected detail: %s", report.Checks[0].Detail)
	}
}

func TestAnalyzeHighRiskManifest(t *testing.T) {
	manifest := `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-gateway
  namespace: production
spec:
  replicas: 1
  template:
    metadata:
      labels:
        app: payment-gateway
    spec:
      nodeSelector:
        dedicated: payments
      containers:
      - name: app
        image: ghcr.io/example/payment-gateway:latest
        imagePullPolicy: IfNotPresent
`

	pods := []model.PodSummary{
		{Name: "a", Namespace: "production", Status: model.PodStatusPending},
		{Name: "b", Namespace: "production", Status: model.PodStatusFailed},
		{Name: "c", Namespace: "production", Status: model.PodStatusPending},
	}
	nodes := []model.NodeSummary{{Name: "node-1", Status: model.NodeStatusNotReady}}
	report := Analyze(manifest, pods, nodes)
	if report.Score < 50 {
		t.Fatalf("score = %d, want >= 50", report.Score)
	}
	if report.Level != "HIGH" && report.Level != "CRITICAL" {
		t.Fatalf("level = %s, want HIGH|CRITICAL", report.Level)
	}
}

func TestAnalyzeLowRiskManifest(t *testing.T) {
	manifest := `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: production
spec:
  replicas: 3
  template:
    metadata:
      labels:
        app: checkout-api
    spec:
      containers:
      - name: app
        image: ghcr.io/example/checkout-api:v1.2.3
        imagePullPolicy: IfNotPresent
        resources:
          requests:
            cpu: "200m"
            memory: "256Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
        securityContext:
          privileged: false
          runAsNonRoot: true
          allowPrivilegeEscalation: false
`

	report := Analyze(manifest, nil, nil)
	if report.Score > 25 {
		t.Fatalf("score = %d, want <= 25", report.Score)
	}
	if report.Level != "LOW" {
		t.Fatalf("level = %s, want LOW", report.Level)
	}
}
