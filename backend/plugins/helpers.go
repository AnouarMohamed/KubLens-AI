// Package plugins provides helper functions used by multiple analyzer plugins.
package plugins

import (
	"strings"

	"kubelens-backend/internal/state"
)

// PodEvents returns events bound to a specific pod identity.
func PodEvents(snapshot state.ClusterState, namespace, name string) []state.EventInfo {
	out := make([]state.EventInfo, 0, 8)
	for _, event := range snapshot.Events {
		if event.Namespace == namespace && event.InvolvedObjectName == name {
			out = append(out, event)
		}
	}
	return out
}

// HasEventReason reports whether any event reason or message contains the fragment.
func HasEventReason(events []state.EventInfo, reasonFragment string) bool {
	if reasonFragment == "" {
		return false
	}
	needle := strings.ToLower(reasonFragment)
	for _, event := range events {
		if strings.Contains(strings.ToLower(event.Reason), needle) {
			return true
		}
		if strings.Contains(strings.ToLower(event.Message), needle) {
			return true
		}
	}
	return false
}
