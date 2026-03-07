// Package diagnostics builds deterministic cluster health signals.
//
// File layout:
//   - analysis_engine.go: public orchestration entrypoint.
//   - analysis_pod.go: pod-level issue detection rules.
//   - analysis_advisor.go: recommendation generation helpers.
//   - present_summary.go: user-facing narrative formatting.
package diagnostics
