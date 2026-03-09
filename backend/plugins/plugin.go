package plugins

import (
	"kubelens-backend/internal/intelligence"
	"kubelens-backend/internal/state"
)

// Plugin defines a pluggable diagnostic analyzer.
type Plugin interface {
	Name() string
	Analyze(state.ClusterState) []intelligence.Diagnostic
}
