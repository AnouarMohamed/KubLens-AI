// Package plugins defines shared interfaces and helpers for diagnostic plugins.
package plugins

import (
	"kubelens-backend/internal/intelligence"
	"kubelens-backend/internal/state"
)

// Plugin defines a pluggable diagnostic analyzer.
type Plugin interface {
	// Name returns a stable plugin identifier used in diagnostics metadata.
	Name() string
	// Analyze inspects a cluster snapshot and returns diagnostics produced by the plugin.
	Analyze(state.ClusterState) []intelligence.Diagnostic
}
