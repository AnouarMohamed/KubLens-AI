package rag

import (
	"context"
	"strings"
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

func TestBuildRetrievalQueryExpandsDomainTerms(t *testing.T) {
	parsed := buildRetrievalQuery("crashloop and imagepullbackoff on payment-api")
	terms := strings.Join(parsed.expandedTerms, " ")

	for _, expected := range []string{"crashloopbackoff", "restart", "probe", "registry", "secret"} {
		if !strings.Contains(terms, expected) {
			t.Fatalf("expanded terms missing %q in %q", expected, terms)
		}
	}
}

func TestRetrievePrefersKeywordCoverage(t *testing.T) {
	svc := NewService(Config{
		Enabled: true,
		Sources: []SourceDoc{
			{
				Source:   "kubernetes",
				Title:    "Kubernetes OOMKilled",
				URL:      "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/",
				Fallback: "OOMKilled indicates a container exceeded memory limit. Tune memory requests and limits to avoid repeated restarts.",
			},
			{
				Source:   "kubernetes",
				Title:    "Kubernetes Services",
				URL:      "https://kubernetes.io/docs/concepts/services-networking/service/",
				Fallback: "Services provide stable networking frontends for pods.",
			},
		},
		RefreshInterval: time.Hour,
	})

	refs := svc.Retrieve(context.Background(), "pod out of memory limit killed", 3)
	if len(refs) == 0 {
		t.Fatal("expected references")
	}
	if refs[0].Title != "Kubernetes OOMKilled" {
		t.Fatalf("top reference = %q, want %q", refs[0].Title, "Kubernetes OOMKilled")
	}
	if !strings.Contains(strings.ToLower(refs[0].Snippet), "memory") {
		t.Fatalf("expected snippet to include memory context, got %q", refs[0].Snippet)
	}
}

func TestRetrieveDedupesSameDocumentURL(t *testing.T) {
	repeated := strings.Repeat("CrashLoopBackOff indicates repeated crashes with restart backoff. ", 40)
	svc := NewService(Config{
		Enabled: true,
		Sources: []SourceDoc{
			{
				Source:   "kubernetes",
				Title:    "CrashLoop troubleshooting",
				URL:      "https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/",
				Fallback: repeated,
			},
			{
				Source:   "kubernetes",
				Title:    "Pod lifecycle",
				URL:      "https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/",
				Fallback: "Pods transition through Pending, Running, Succeeded and Failed phases.",
			},
		},
		RefreshInterval: time.Hour,
	})

	refs := svc.Retrieve(context.Background(), "crashloop restart backoff", 5)
	if len(refs) == 0 {
		t.Fatal("expected references")
	}
	seen := map[string]struct{}{}
	for _, ref := range refs {
		if _, exists := seen[ref.URL]; exists {
			t.Fatalf("duplicate URL returned: %s", ref.URL)
		}
		seen[ref.URL] = struct{}{}
	}
}

func TestBestSnippetFindsRelevantWindow(t *testing.T) {
	text := strings.Repeat("control plane healthy and stable. ", 20) +
		"node pressure eviction signal triggered for memory threshold. " +
		strings.Repeat("background status line. ", 20)

	snippet := bestSnippet(text, []string{"eviction", "pressure"}, 160)
	lower := strings.ToLower(snippet)
	if !strings.Contains(lower, "eviction") {
		t.Fatalf("expected snippet to include target term, got %q", snippet)
	}
}

func TestRetrieveDisabledReturnsNil(t *testing.T) {
	svc := NewService(Config{Enabled: false})
	refs := svc.Retrieve(context.Background(), "pod failed", 3)
	if len(refs) != 0 {
		t.Fatalf("expected empty references when disabled, got %d", len(refs))
	}
}
