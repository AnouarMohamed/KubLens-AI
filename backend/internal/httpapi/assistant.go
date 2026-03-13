package httpapi

import (
	"regexp"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/model"
)

var diagnoseRegex = regexp.MustCompile(`(?i)diagnose\s+([a-z0-9-]+)`)

var (
	defaultHints = []string{
		"Diagnose payment-gateway",
		"Show cluster health",
		"Generate deployment manifest",
	}
	healthHints = []string{
		"Show failed pods",
		"Show node risks",
		"Diagnose payment-gateway",
	}
)

type assistantRequest struct {
	Message   string `json:"message"`
	Namespace string `json:"namespace,omitempty"`
}

type assistantIntent int

const (
	intentUnknown assistantIntent = iota
	intentDiagnose
	intentManifest
	intentHealth
	intentPriority
)

type assistantContext struct {
	intent             string
	userMessage        string
	localAnswer        string
	hints              []string
	resources          []string
	docReferences      []model.DocumentationReference
	diagnosticsSummary string
	diagnostics        model.DiagnosticsResult
	diagnosticBriefs   []ai.DiagnosticBrief
	priorityActions    string
	pods               []model.PodSummary
	nodes              []model.NodeSummary
	promptContext      string
}
