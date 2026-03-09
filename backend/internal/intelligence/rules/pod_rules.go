package rules

import (
	"strings"

	"kubelens-backend/internal/state"
)

func IsCrashLoop(pod state.PodInfo) bool {
	if pod.Restarts >= 3 {
		return true
	}
	return hasContainerWaitingReason(pod, "CrashLoopBackOff")
}

func IsOOMKilled(pod state.PodInfo) bool {
	for _, container := range pod.Containers {
		if strings.EqualFold(container.TerminatedReason, "OOMKilled") {
			return true
		}
		if strings.Contains(strings.ToLower(container.WaitingReason), "oom") {
			return true
		}
	}
	return false
}

func IsImagePullFailure(pod state.PodInfo) bool {
	return hasContainerWaitingReason(pod, "ImagePullBackOff") || hasContainerWaitingReason(pod, "ErrImagePull")
}

func IsPending(pod state.PodInfo) bool {
	return strings.EqualFold(pod.Phase, "Pending")
}

func IsFailed(pod state.PodInfo) bool {
	return strings.EqualFold(pod.Phase, "Failed")
}

func hasContainerWaitingReason(pod state.PodInfo, reason string) bool {
	for _, container := range pod.Containers {
		if strings.EqualFold(container.WaitingReason, reason) {
			return true
		}
	}
	return false
}
