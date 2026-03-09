package ai

import (
	"encoding/json"
)

func formatDiagnosticsForPrompt(diags []DiagnosticBrief) string {
	if len(diags) == 0 {
		return "No structured diagnostics available."
	}

	encoded, err := json.Marshal(diags)
	if err != nil {
		return "Failed to encode diagnostics payload."
	}
	return string(encoded)
}
