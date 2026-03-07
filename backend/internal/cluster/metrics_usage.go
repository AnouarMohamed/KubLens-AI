package cluster

import (
	"context"
	"fmt"
	"math"

	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
)

type resourceUsage struct {
	CPUMilli    int64
	MemoryBytes int64
}

func (s *Service) fetchUsage(ctx context.Context) (map[string]resourceUsage, map[string]resourceUsage) {
	if s.metricsClient == nil {
		return nil, nil
	}

	podList, podErr := s.metricsClient.MetricsV1beta1().PodMetricses("").List(ctx, metav1.ListOptions{})
	nodeList, nodeErr := s.metricsClient.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{})
	if podErr != nil && nodeErr != nil {
		return nil, nil
	}

	return podUsageIndex(podList), nodeUsageIndex(nodeList)
}

func podUsageIndex(list *metricsv1beta1.PodMetricsList) map[string]resourceUsage {
	if list == nil {
		return nil
	}

	out := make(map[string]resourceUsage, len(list.Items))
	for _, item := range list.Items {
		var usage resourceUsage
		for _, container := range item.Containers {
			if cpu := container.Usage.Cpu(); cpu != nil {
				usage.CPUMilli += cpu.MilliValue()
			}
			if memory := container.Usage.Memory(); memory != nil {
				usage.MemoryBytes += memory.Value()
			}
		}
		out[podUsageKey(item.Namespace, item.Name)] = usage
	}
	return out
}

func nodeUsageIndex(list *metricsv1beta1.NodeMetricsList) map[string]resourceUsage {
	if list == nil {
		return nil
	}

	out := make(map[string]resourceUsage, len(list.Items))
	for _, item := range list.Items {
		var usage resourceUsage
		if cpu := item.Usage.Cpu(); cpu != nil {
			usage.CPUMilli = cpu.MilliValue()
		}
		if memory := item.Usage.Memory(); memory != nil {
			usage.MemoryBytes = memory.Value()
		}
		out[item.Name] = usage
	}
	return out
}

func podUsageKey(namespace, name string) string {
	return namespace + "/" + name
}

func formatMilliCPU(milli int64) string {
	if milli < 0 {
		milli = 0
	}
	return fmt.Sprintf("%dm", milli)
}

func formatMemoryBytes(bytes int64) string {
	if bytes < 0 {
		bytes = 0
	}
	return resource.NewQuantity(bytes, resource.BinarySI).String()
}

func formatUsagePercent(used, total int64) string {
	if total <= 0 {
		return "N/A"
	}

	percent := (float64(used) / float64(total)) * 100
	if percent < 0 {
		percent = 0
	}
	return fmt.Sprintf("%d%%", int(math.Round(percent)))
}
