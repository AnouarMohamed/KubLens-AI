package alerts

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"kubelens-backend/internal/model"
)

type Config struct {
	AlertmanagerURL     string
	SlackWebhookURL     string
	PagerDutyEventsURL  string
	PagerDutyRoutingKey string
	Timeout             time.Duration
}

type Dispatcher interface {
	Dispatch(ctx context.Context, req model.AlertDispatchRequest) model.AlertDispatchResponse
	Enabled() bool
}

type Service struct {
	client              *http.Client
	alertmanagerURL     string
	slackWebhookURL     string
	pagerDutyEventsURL  string
	pagerDutyRoutingKey string
}

func New(config Config) *Service {
	timeout := config.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	return &Service{
		client:              &http.Client{Timeout: timeout},
		alertmanagerURL:     strings.TrimSpace(config.AlertmanagerURL),
		slackWebhookURL:     strings.TrimSpace(config.SlackWebhookURL),
		pagerDutyEventsURL:  strings.TrimSpace(config.PagerDutyEventsURL),
		pagerDutyRoutingKey: strings.TrimSpace(config.PagerDutyRoutingKey),
	}
}

func (s *Service) Enabled() bool {
	return s.alertmanagerURL != "" || s.slackWebhookURL != "" || s.pagerDutyEventsURL != ""
}

func (s *Service) Dispatch(ctx context.Context, req model.AlertDispatchRequest) model.AlertDispatchResponse {
	results := make([]model.AlertChannelResult, 0, 3)

	if s.alertmanagerURL != "" {
		results = append(results, s.dispatchAlertmanager(ctx, req))
	}
	if s.slackWebhookURL != "" {
		results = append(results, s.dispatchSlack(ctx, req))
	}
	if s.pagerDutyEventsURL != "" {
		results = append(results, s.dispatchPagerDuty(ctx, req))
	}

	success := true
	for _, item := range results {
		if !item.Success {
			success = false
			break
		}
	}

	return model.AlertDispatchResponse{
		Success: success,
		Results: results,
	}
}

func (s *Service) dispatchAlertmanager(ctx context.Context, req model.AlertDispatchRequest) model.AlertChannelResult {
	payload := []map[string]any{
		{
			"labels": map[string]string{
				"alertname": safeValue(req.Title, "KubeLensAlert"),
				"severity":  safeValue(req.Severity, "warning"),
				"source":    safeValue(req.Source, "kubelens"),
			},
			"annotations": map[string]string{
				"summary":     safeValue(req.Title, "KubeLens alert"),
				"description": req.Message,
			},
			"startsAt": time.Now().UTC().Format(time.RFC3339),
		},
	}

	err := s.postJSON(ctx, s.alertmanagerURL, payload)
	return channelResult("alertmanager", err)
}

func (s *Service) dispatchSlack(ctx context.Context, req model.AlertDispatchRequest) model.AlertChannelResult {
	text := "[" + strings.ToUpper(safeValue(req.Severity, "warning")) + "] " + safeValue(req.Title, "KubeLens alert")
	if strings.TrimSpace(req.Message) != "" {
		text += "\n" + req.Message
	}

	err := s.postJSON(ctx, s.slackWebhookURL, map[string]string{"text": text})
	return channelResult("slack", err)
}

func (s *Service) dispatchPagerDuty(ctx context.Context, req model.AlertDispatchRequest) model.AlertChannelResult {
	if s.pagerDutyRoutingKey == "" {
		return channelResult("pagerduty", errors.New("missing pagerduty routing key"))
	}

	payload := map[string]any{
		"routing_key":  s.pagerDutyRoutingKey,
		"event_action": "trigger",
		"payload": map[string]any{
			"summary":   safeValue(req.Title, "KubeLens alert"),
			"source":    safeValue(req.Source, "kubelens"),
			"severity":  normalizePagerDutySeverity(req.Severity),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"custom_details": map[string]any{
				"message": req.Message,
				"tags":    req.Tags,
			},
		},
	}

	err := s.postJSON(ctx, s.pagerDutyEventsURL, payload)
	return channelResult("pagerduty", err)
}

func (s *Service) postJSON(ctx context.Context, url string, payload any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(encoded))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return errors.New("webhook returned status " + resp.Status)
	}
	return nil
}

func channelResult(channel string, err error) model.AlertChannelResult {
	if err != nil {
		return model.AlertChannelResult{
			Channel: channel,
			Success: false,
			Error:   err.Error(),
		}
	}
	return model.AlertChannelResult{
		Channel: channel,
		Success: true,
	}
}

func safeValue(value, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func normalizePagerDutySeverity(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "critical":
		return "critical"
	case "warning":
		return "warning"
	case "error":
		return "error"
	default:
		return "info"
	}
}
