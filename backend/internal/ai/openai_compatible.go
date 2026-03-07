package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.openai.com/v1"

type OpenAICompatibleConfig struct {
	BaseURL     string
	APIKey      string
	Model       string
	Temperature float64
	MaxTokens   int
	HTTPClient  *http.Client
}

type OpenAICompatibleProvider struct {
	baseURL     string
	apiKey      string
	model       string
	temperature float64
	maxTokens   int
	client      *http.Client
}

func NewOpenAICompatibleProvider(cfg OpenAICompatibleConfig) (*OpenAICompatibleProvider, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, errors.New("missing API key")
	}
	if strings.TrimSpace(cfg.Model) == "" {
		return nil, errors.New("missing model")
	}

	temperature := cfg.Temperature
	if temperature == 0 {
		temperature = 0.2
	}
	maxTokens := cfg.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 700
	}

	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 12 * time.Second}
	}

	return &OpenAICompatibleProvider{
		baseURL:     baseURL,
		apiKey:      cfg.APIKey,
		model:       cfg.Model,
		temperature: temperature,
		maxTokens:   maxTokens,
		client:      client,
	}, nil
}

func (p *OpenAICompatibleProvider) Name() string {
	return "openai-compatible"
}

func (p *OpenAICompatibleProvider) Generate(ctx context.Context, in Input) (string, error) {
	body, err := json.Marshal(chatCompletionsRequest{
		Model: p.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt()},
			{Role: "user", Content: userPrompt(in)},
		},
		Temperature: p.temperature,
		MaxTokens:   p.maxTokens,
	})
	if err != nil {
		return "", fmt.Errorf("encode request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request provider: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<10))
		return "", fmt.Errorf("provider status %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))
	}

	var out chatCompletionsResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("decode provider response: %w", err)
	}
	if len(out.Choices) == 0 {
		return "", errors.New("provider returned no choices")
	}

	answer := strings.TrimSpace(out.Choices[0].Message.Content)
	if answer == "" {
		return "", errors.New("provider returned empty answer")
	}
	return answer, nil
}

type chatCompletionsRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionsResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

func systemPrompt() string {
	return strings.Join([]string{
		"You are a senior Kubernetes SRE assistant.",
		"Use only provided data; do not invent cluster facts.",
		"Be concise and action-oriented.",
		"Output sections in markdown:",
		"1) Most likely root cause",
		"2) Evidence",
		"3) Verify now (kubectl commands)",
		"4) Safe fix plan",
		"If data is insufficient, state what is missing.",
	}, "\n")
}

func userPrompt(in Input) string {
	return strings.Join([]string{
		"User request:",
		in.UserMessage,
		"",
		"Detected intent:",
		in.Intent,
		"",
		"Deterministic baseline answer:",
		in.LocalAnswer,
		"",
		"Diagnostics summary:",
		in.DiagnosticsSummary,
		"",
		"Priority actions:",
		in.PriorityActions,
		"",
		"Referenced resources:",
		strings.Join(in.ReferencedResources, ", "),
		"",
		"Cluster snapshot brief:",
		in.ClusterSnapshotBrief,
	}, "\n")
}
