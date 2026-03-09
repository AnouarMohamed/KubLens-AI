package intelligence

import (
	"time"

	"kubelens-backend/internal/state"
)

type PluginRunner struct {
	Name    string
	Analyze func(state.ClusterState) []Diagnostic
}

// Analyzer executes diagnostic plugins against cluster state.
type Analyzer struct {
	plugins []PluginRunner
	now     func() time.Time
}

func NewAnalyzer(now func() time.Time, plugins ...PluginRunner) *Analyzer {
	if now == nil {
		now = time.Now
	}
	return &Analyzer{
		plugins: append([]PluginRunner(nil), plugins...),
		now:     now,
	}
}

func (a *Analyzer) Analyze(snapshot state.ClusterState) Report {
	if a == nil {
		return newReport(time.Now(), nil)
	}

	diags := make([]Diagnostic, 0, 16)
	for _, plugin := range a.plugins {
		if plugin.Analyze == nil {
			continue
		}
		items := plugin.Analyze(snapshot)
		for i := range items {
			if items[i].Source == "" {
				items[i].Source = plugin.Name
			}
		}
		diags = append(diags, items...)
	}

	return newReport(a.now(), diags)
}
