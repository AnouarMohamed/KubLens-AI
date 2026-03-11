package chatops

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"kubelens-backend/internal/model"
)

type Config struct {
	SlackWebhookURL      string
	BaseURL              string
	NotifyIncidents      bool
	NotifyRemediations   bool
	NotifyPostmortems    bool
	NotifyAssistantFinds bool
}

type SlackNotifier struct {
	cfg    Config
	client *http.Client
	logger *slog.Logger
	now    func() time.Time

	mu       sync.Mutex
	lastSent map[string]time.Time
}

func NewSlackNotifier(cfg Config, logger *slog.Logger, client *http.Client) *SlackNotifier {
	if logger == nil {
		logger = slog.Default()
	}
	httpClient := client
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 8 * time.Second}
	}
	return &SlackNotifier{
		cfg: Config{
			SlackWebhookURL:      strings.TrimSpace(cfg.SlackWebhookURL),
			BaseURL:              strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/"),
			NotifyIncidents:      cfg.NotifyIncidents,
			NotifyRemediations:   cfg.NotifyRemediations,
			NotifyPostmortems:    cfg.NotifyPostmortems,
			NotifyAssistantFinds: cfg.NotifyAssistantFinds,
		},
		client:   httpClient,
		logger:   logger,
		now:      time.Now,
		lastSent: make(map[string]time.Time, 64),
	}
}

func (n *SlackNotifier) Enabled() bool {
	return n != nil && strings.TrimSpace(n.cfg.SlackWebhookURL) != ""
}

func (n *SlackNotifier) NotifyIncident(ctx context.Context, incident model.Incident) {
	if !n.Enabled() || !n.cfg.NotifyIncidents {
		return
	}
	key := "incident:" + strings.TrimSpace(incident.ID)
	if n.shouldSkip(key) {
		return
	}

	title := strings.TrimSpace(incident.Title)
	if title == "" {
		title = "Cluster incident"
	}
	emoji := severityEmoji(incident.Severity)
	pendingCount := 0
	for _, step := range incident.Runbook {
		if step.Status == model.RunbookStepStatusPending || step.Status == model.RunbookStepStatusInProgress {
			pendingCount++
		}
	}
	resourceText := "none"
	if len(incident.AffectedResources) > 0 {
		resourceText = strings.Join(incident.AffectedResources, ", ")
	}

	blocks := []map[string]any{
		headerBlock(fmt.Sprintf("%s %s Incident: %s", emoji, strings.Title(strings.TrimSpace(incident.Severity)), title)),
		sectionFieldsBlock(
			field("*Severity:*\n"+strings.Title(strings.TrimSpace(incident.Severity))),
			field("*Opened:*\n"+incident.OpenedAt),
			field("*Resources:*\n"+resourceText),
			field(fmt.Sprintf("*Runbook steps:*\n%d steps pending", pendingCount)),
		),
		dividerBlock(),
		actionButtonBlock("View Incident", n.cfg.BaseURL+"/incidents/"+incident.ID, "primary"),
	}

	n.send(ctx, key, "incident", blocks)
}

func (n *SlackNotifier) NotifyRemediation(ctx context.Context, proposal model.RemediationProposal) {
	if !n.Enabled() || !n.cfg.NotifyRemediations {
		return
	}
	key := "remediation:" + strings.TrimSpace(proposal.ID)
	if n.shouldSkip(key) {
		return
	}

	resource := proposal.Resource
	if proposal.Namespace != "" {
		resource = proposal.Namespace + "/" + proposal.Resource
	}
	blocks := []map[string]any{
		headerBlock("🟡 Remediation Proposal: " + strings.ReplaceAll(string(proposal.Kind), "_", " ")),
		sectionFieldsBlock(
			field("*Resource:*\n"+resource),
			field("*Risk:*\n"+strings.Title(strings.TrimSpace(proposal.RiskLevel))),
			field("*Status:*\n"+strings.Title(strings.TrimSpace(proposal.Status))),
			field("*Reason:*\n"+proposal.Reason),
		),
		dividerBlock(),
		actionButtonBlock("Approve in KubeLens", n.cfg.BaseURL+"/remediation?approve="+proposal.ID, "primary"),
	}

	n.send(ctx, key, "remediation", blocks)
}

func (n *SlackNotifier) NotifyPostmortem(ctx context.Context, postmortem model.Postmortem) {
	if !n.Enabled() || !n.cfg.NotifyPostmortems {
		return
	}
	key := "postmortem:" + strings.TrimSpace(postmortem.ID)
	if n.shouldSkip(key) {
		return
	}

	emoji := "🟢"
	if strings.EqualFold(postmortem.Severity, "critical") {
		emoji = "🔴"
	} else if strings.EqualFold(postmortem.Severity, "warning") {
		emoji = "🟡"
	}
	blocks := []map[string]any{
		headerBlock(fmt.Sprintf("%s Postmortem Generated: %s", emoji, postmortem.IncidentTitle)),
		sectionFieldsBlock(
			field("*Severity:*\n"+strings.Title(postmortem.Severity)),
			field("*Duration:*\n"+postmortem.Duration),
			field("*Method:*\n"+strings.ToUpper(string(postmortem.Method))),
			field("*Generated:*\n"+postmortem.GeneratedAt),
		),
		dividerBlock(),
		actionButtonBlock("View Postmortem", n.cfg.BaseURL+"/postmortem?id="+postmortem.ID, "primary"),
	}

	n.send(ctx, key, "postmortem", blocks)
}

func (n *SlackNotifier) NotifyAssistantFinding(ctx context.Context, finding string, resources []string) {
	if !n.Enabled() || !n.cfg.NotifyAssistantFinds {
		return
	}
	key := "assistant:" + strings.ToLower(strings.TrimSpace(finding))
	if n.shouldSkip(key) {
		return
	}
	resourceText := "none"
	if len(resources) > 0 {
		resourceText = strings.Join(resources, ", ")
	}
	blocks := []map[string]any{
		headerBlock("🟡 Assistant Finding"),
		sectionFieldsBlock(
			field("*Summary:*\n"+strings.TrimSpace(finding)),
			field("*Resources:*\n"+resourceText),
		),
	}
	n.send(ctx, key, "assistant_finding", blocks)
}

func (n *SlackNotifier) shouldSkip(key string) bool {
	if strings.TrimSpace(key) == "" {
		return false
	}

	n.mu.Lock()
	defer n.mu.Unlock()

	nowAt := n.now()
	last, ok := n.lastSent[key]
	if ok && nowAt.Sub(last) < 5*time.Minute {
		return true
	}
	n.lastSent[key] = nowAt
	return false
}

func (n *SlackNotifier) send(ctx context.Context, key string, payloadType string, blocks []map[string]any) {
	if !n.Enabled() {
		return
	}

	body, err := json.Marshal(map[string]any{
		"blocks": blocks,
	})
	if err != nil {
		n.logger.Warn("chatops payload encode failed", "type", payloadType, "error", err.Error())
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.cfg.SlackWebhookURL, bytes.NewReader(body))
	if err != nil {
		n.logger.Warn("chatops request build failed", "type", payloadType, "error", err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.client.Do(req)
	if err != nil {
		n.logger.Warn("chatops delivery failed", "type", payloadType, "key", key, "error", err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		n.logger.Warn("chatops delivery non-2xx",
			"type", payloadType,
			"key", key,
			"status", resp.StatusCode,
		)
	}
}

func headerBlock(text string) map[string]any {
	return map[string]any{
		"type": "header",
		"text": map[string]any{
			"type": "plain_text",
			"text": text,
		},
	}
}

func field(text string) map[string]any {
	return map[string]any{
		"type": "mrkdwn",
		"text": text,
	}
}

func sectionFieldsBlock(fields ...map[string]any) map[string]any {
	return map[string]any{
		"type":   "section",
		"fields": fields,
	}
}

func dividerBlock() map[string]any {
	return map[string]any{"type": "divider"}
}

func actionButtonBlock(text string, url string, style string) map[string]any {
	button := map[string]any{
		"type": "button",
		"text": map[string]any{
			"type": "plain_text",
			"text": text,
		},
		"url": url,
	}
	if strings.TrimSpace(style) != "" {
		button["style"] = style
	}
	return map[string]any{
		"type": "actions",
		"elements": []map[string]any{
			button,
		},
	}
}

func severityEmoji(severity string) string {
	switch strings.ToLower(strings.TrimSpace(severity)) {
	case "critical":
		return "🔴"
	case "warning":
		return "🟡"
	case "resolved":
		return "🟢"
	default:
		return "🟡"
	}
}
