package state

import (
	"context"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
)

func (c *ClusterCache) refreshUsage(ctx context.Context) error {
	if c.metricsClient == nil {
		return nil
	}

	var (
		podMetrics  *metricsv1beta1.PodMetricsList
		nodeMetrics *metricsv1beta1.NodeMetricsList
		podErr      error
		nodeErr     error
	)

	podMetrics, podErr = c.metricsClient.MetricsV1beta1().PodMetricses("").List(ctx, metav1.ListOptions{})
	nodeMetrics, nodeErr = c.metricsClient.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{})

	if podErr != nil && nodeErr != nil {
		return fmt.Errorf("metrics unavailable: pods=%v nodes=%v", podErr, nodeErr)
	}

	now := time.Now().UTC()

	c.mu.Lock()
	defer c.mu.Unlock()

	if podMetrics != nil {
		for _, item := range podMetrics.Items {
			key := item.Namespace + "/" + item.Name
			pod, ok := c.state.Pods[key]
			if !ok {
				continue
			}
			usage := ResourceQuantities{}
			for _, container := range item.Containers {
				if cpu := container.Usage.Cpu(); cpu != nil {
					usage.CPUMilli += cpu.MilliValue()
				}
				if memory := container.Usage.Memory(); memory != nil {
					usage.MemoryBytes += memory.Value()
				}
			}
			pod.Usage = usage
			pod.UsageHistory = appendUsage(pod.UsageHistory, UsagePoint{Timestamp: now, Usage: usage})
			c.state.Pods[key] = pod
		}
	}

	if nodeMetrics != nil {
		for _, item := range nodeMetrics.Items {
			node, ok := c.state.Nodes[item.Name]
			if !ok {
				continue
			}
			usage := ResourceQuantities{}
			if cpu := item.Usage.Cpu(); cpu != nil {
				usage.CPUMilli = cpu.MilliValue()
			}
			if memory := item.Usage.Memory(); memory != nil {
				usage.MemoryBytes = memory.Value()
			}
			node.Usage = usage
			node.UsageHistory = appendUsage(node.UsageHistory, UsagePoint{Timestamp: now, Usage: usage})
			c.state.Nodes[item.Name] = node
		}
	}

	c.setLastUpdated()
	return nil
}

func appendUsage(history []UsagePoint, point UsagePoint) []UsagePoint {
	history = append(history, point)
	if len(history) > maxUsageSamples {
		history = history[len(history)-maxUsageSamples:]
	}
	return history
}
