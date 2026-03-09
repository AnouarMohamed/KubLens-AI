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
	SystemContext        string
	LocalAnswer          string
	DiagnosticsSummary   string
	Diagnostics          []DiagnosticBrief
	PriorityActions      string
	ReferencedResources  []string
	ClusterSnapshotBrief string
	DocumentationContext string
	DocumentationRefs    []DocReference
	EnrichedContext      string
}

type DiagnosticBrief struct {
	Severity       string
	Resource       string
	Namespace      string
	Message        string
	Evidence       []string
	Recommendation string
	Source         string
}

// Provider generates an assistant answer from normalized context.
type Provider interface {
	Name() string
	Generate(ctx context.Context, in Input) (string, error)
}

type ToolDefinition struct {
	Name        string
	Description string
	Parameters  any
}

type ToolCall struct {
	ID        string
	Name      string
	Arguments string
}

type ChatMessage struct {
	Role       string
	Content    string
	ToolCalls  []ToolCall
	ToolCallID string
}

type ChatRequest struct {
	Model       string
	Messages    []ChatMessage
	Temperature float64
	MaxTokens   int
	Tools       []ToolDefinition
}

type ChatResponse struct {
	Content   string
	ToolCalls []ToolCall
}

type ToolingProvider interface {
	Name() string
	Chat(ctx context.Context, req ChatRequest) (ChatResponse, error)
}
