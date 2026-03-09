package httpapi

import (
	"fmt"
	"strings"

	"kubelens-backend/internal/model"
)

func renderPodDescribe(pod model.PodDetail, events []model.K8sEvent) string {
	lines := []string{
		fmt.Sprintf("Name:\t%s", pod.Name),
		fmt.Sprintf("Namespace:\t%s", pod.Namespace),
		fmt.Sprintf("Node:\t%s", pod.NodeName),
		fmt.Sprintf("Status:\t%s", pod.Status),
		fmt.Sprintf("Restarts:\t%d", pod.Restarts),
		fmt.Sprintf("Age:\t%s", pod.Age),
		"",
		"Containers:",
	}

	for _, container := range pod.Containers {
		lines = append(lines,
			fmt.Sprintf("  %s:", container.Name),
			fmt.Sprintf("    Image:\t%s", container.Image),
			fmt.Sprintf("    Requests:\tCPU=%s Memory=%s", safeResource(container.Resources, true, "cpu"), safeResource(container.Resources, true, "memory")),
			fmt.Sprintf("    Limits:\tCPU=%s Memory=%s", safeResource(container.Resources, false, "cpu"), safeResource(container.Resources, false, "memory")),
		)
	}

	if len(events) > 0 {
		lines = append(lines, "", "Events:")
		for _, event := range events {
			lines = append(lines, fmt.Sprintf("  %s\t%s\t%s\t%s", event.Type, event.Reason, event.Age, event.Message))
		}
	}

	return strings.Join(lines, "\n")
}

func safeResource(resources *model.ContainerResources, requests bool, key string) string {
	if resources == nil {
		return "-"
	}
	if requests {
		if resources.Requests == nil {
			return "-"
		}
		if key == "cpu" {
			return defaultString(resources.Requests.CPU)
		}
		return defaultString(resources.Requests.Memory)
	}
	if resources.Limits == nil {
		return "-"
	}
	if key == "cpu" {
		return defaultString(resources.Limits.CPU)
	}
	return defaultString(resources.Limits.Memory)
}

func defaultString(value string) string {
	if strings.TrimSpace(value) == "" {
		return "-"
	}
	return value
}
