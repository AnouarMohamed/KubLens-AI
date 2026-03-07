package rag

import (
	"context"
	"testing"
	"time"
)

func TestRetrieveReturnsReferences(t *testing.T) {
	svc := NewService(Config{
		Enabled: true,
		Sources: []SourceDoc{
			{
				Source:   "kubernetes",
				Title:    "Pod lifecycle",
				URL:      "https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/",
				Fallback: "Pending often indicates scheduling issues. Failed indicates terminated containers.",
			},
			{
				Source:   "docker",
				Title:    "Resource constraints",
				URL:      "https://docs.docker.com/engine/containers/resource_constraints/",
				Fallback: "Memory limits may lead to OOM kills. CPU quotas can throttle workloads.",
			},
		},
		RefreshInterval: time.Hour,
	})

	refs := svc.Retrieve(context.Background(), "oom memory limits", 3)
	if len(refs) == 0 {
		t.Fatal("expected non-empty references")
	}
	if refs[0].URL == "" {
		t.Fatal("expected reference URL")
	}
}

func TestRetrieveDisabledReturnsNil(t *testing.T) {
	svc := NewService(Config{Enabled: false})
	refs := svc.Retrieve(context.Background(), "pod failed", 3)
	if len(refs) != 0 {
		t.Fatalf("expected empty references when disabled, got %d", len(refs))
	}
}
