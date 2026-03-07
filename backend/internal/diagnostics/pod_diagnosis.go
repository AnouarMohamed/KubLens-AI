package diagnostics

import (
	"fmt"
	"strings"

	"kubelens-backend/internal/model"
)

type PodDiagnosis struct {
	RootCause string
	Evidence  []string
	Actions   []string
}

// DiagnosePodIssue classifies probable root causes from pod state, event stream, and logs.
func DiagnosePodIssue(pod model.PodSummary, events []model.K8sEvent, logs string) PodDiagnosis {
	reasons := eventReasonSet(events)
	logText := strings.ToLower(logs)

	if reasons.contains("failedscheduling") {
		return PodDiagnosis{
			RootCause: "Scheduling failure",
			Evidence: []string{
				"Events contain FailedScheduling.",
				"Pod was not successfully assigned to a node.",
			},
			Actions: []string{
				"Check requested CPU/memory versus node allocatable capacity.",
				"Validate node selectors, taints, and tolerations.",
			},
		}
	}

	if reasons.contains("backoff") || pod.Restarts >= 3 {
		if strings.Contains(logText, "connection timeout") || strings.Contains(logText, "dial tcp") {
			return PodDiagnosis{
				RootCause: "Dependency connectivity failure",
				Evidence: []string{
					"Logs contain repeated connection timeout errors.",
					"BackOff or restart events indicate repeated startup failures.",
				},
				Actions: []string{
					"Validate service endpoints, DNS, and network policies.",
					"Gate startup on dependency health checks.",
					"Add retry/backoff strategy during bootstrap.",
				},
			}
		}

		if strings.Contains(logText, "oomkilled") || reasons.contains("oom") {
			return PodDiagnosis{
				RootCause: "Memory pressure / OOM kill",
				Evidence: []string{
					"Events or logs indicate OOM-related termination.",
					fmt.Sprintf("Restart count is elevated (%d).", pod.Restarts),
				},
				Actions: []string{
					"Increase memory requests and limits.",
					"Profile memory usage and reduce peak allocations.",
				},
			}
		}

		return PodDiagnosis{
			RootCause: "Container crash loop",
			Evidence: []string{
				"BackOff events indicate repeated restart attempts.",
				fmt.Sprintf("Pod restart count is %d.", pod.Restarts),
			},
			Actions: []string{
				"Inspect entrypoint and startup dependencies.",
				"Validate secrets and environment variables.",
			},
		}
	}

	if reasons.contains("imagepull") || strings.Contains(logText, "image pull") {
		return PodDiagnosis{
			RootCause: "Image pull failure",
			Evidence: []string{
				"Event stream indicates image pull errors.",
				"Container image was not fetched successfully.",
			},
			Actions: []string{
				"Verify image tag and registry credentials.",
				"Check registry reachability from worker nodes.",
			},
		}
	}

	if pod.Status == model.PodStatusPending {
		return PodDiagnosis{
			RootCause: "Pending workload",
			Evidence: []string{
				"Pod remains in Pending state.",
			},
			Actions: []string{
				"Review scheduler events and resource requests.",
				"Check PVC binding or taint mismatch conditions.",
			},
		}
	}

	return PodDiagnosis{
		RootCause: "No critical fault signature detected",
		Evidence: []string{
			"Current logs and events do not show a critical pattern.",
		},
		Actions: []string{
			"Continue monitoring and capture longer logs if issue recurs.",
			"Correlate with node events and recent deployment changes.",
		},
	}
}

// BuildPodDiagnosisMessage renders a markdown answer expected by the existing frontend UI.
func BuildPodDiagnosisMessage(pod model.PodSummary, analysis PodDiagnosis) string {
	lines := []string{
		fmt.Sprintf("### Pod Diagnostic: %s/%s", pod.Namespace, pod.Name),
		"",
		fmt.Sprintf("- Status: %s", pod.Status),
		fmt.Sprintf("- Restarts: %d", pod.Restarts),
		fmt.Sprintf("- Age: %s", pod.Age),
		"",
		fmt.Sprintf("**Root Cause**: %s", analysis.RootCause),
		"",
		"**Evidence**",
	}

	for _, evidence := range analysis.Evidence {
		lines = append(lines, "- "+evidence)
	}

	lines = append(lines, "", "**Recommended Fix**")
	for _, action := range analysis.Actions {
		lines = append(lines, "- "+action)
	}

	return strings.Join(lines, "\n")
}

type reasonSet []string

func eventReasonSet(events []model.K8sEvent) reasonSet {
	out := make(reasonSet, 0, len(events))
	for _, event := range events {
		out = append(out, strings.ToLower(event.Reason))
	}
	return out
}

func (r reasonSet) contains(fragment string) bool {
	for _, reason := range r {
		if strings.Contains(reason, fragment) {
			return true
		}
	}
	return false
}
