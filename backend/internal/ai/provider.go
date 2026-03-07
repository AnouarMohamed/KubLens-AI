package ai

import "context"

type DocReference struct {
	Title   string
	URL     string
	Source  string
	Snippet string
}

// Input is the normalized context passed to an AI provider.
type Input struct {
	UserMessage          string
	Intent               string
	LocalAnswer          string
	DiagnosticsSummary   string
	PriorityActions      string
	ReferencedResources  []string
	ClusterSnapshotBrief string
	DocumentationContext string
	DocumentationRefs    []DocReference
}

// Provider generates an assistant answer from normalized context.
type Provider interface {
	Name() string
	Generate(ctx context.Context, in Input) (string, error)
}
