package model

type AlertChannelResult struct {
	Channel string `json:"channel"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type AlertDispatchRequest struct {
	Title    string   `json:"title"`
	Message  string   `json:"message"`
	Severity string   `json:"severity,omitempty"`
	Source   string   `json:"source,omitempty"`
	Tags     []string `json:"tags,omitempty"`
}

type AlertDispatchResponse struct {
	Success bool                 `json:"success"`
	Results []AlertChannelResult `json:"results"`
}

type NodeAlertLifecycleStatus string

const (
	NodeAlertStatusActive       NodeAlertLifecycleStatus = "active"
	NodeAlertStatusAcknowledged NodeAlertLifecycleStatus = "acknowledged"
	NodeAlertStatusSnoozed      NodeAlertLifecycleStatus = "snoozed"
	NodeAlertStatusDismissed    NodeAlertLifecycleStatus = "dismissed"
)

type NodeAlertLifecycle struct {
	ID           string                   `json:"id"`
	Node         string                   `json:"node"`
	Rule         string                   `json:"rule"`
	Status       NodeAlertLifecycleStatus `json:"status"`
	Note         string                   `json:"note,omitempty"`
	SnoozedUntil string                   `json:"snoozedUntil,omitempty"`
	UpdatedAt    string                   `json:"updatedAt"`
	UpdatedBy    string                   `json:"updatedBy,omitempty"`
}

type NodeAlertLifecycleUpdateRequest struct {
	ID            string                   `json:"id"`
	Node          string                   `json:"node"`
	Rule          string                   `json:"rule"`
	Status        NodeAlertLifecycleStatus `json:"status"`
	Note          string                   `json:"note,omitempty"`
	SnoozeMinutes int                      `json:"snoozeMinutes,omitempty"`
}
