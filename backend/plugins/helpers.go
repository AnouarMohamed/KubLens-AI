package plugins

import (
	"strings"

	"kubelens-backend/internal/state"
)

func PodEvents(snapshot state.ClusterState, namespace, name string) []state.EventInfo {
	out := make([]state.EventInfo, 0, 8)
	for _, event := range snapshot.Events {
		if event.Namespace == namespace && event.InvolvedObjectName == name {
			out = append(out, event)
		}
	}
	return out
}

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
