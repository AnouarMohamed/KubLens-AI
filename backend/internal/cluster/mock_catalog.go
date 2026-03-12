package cluster

import (
	"fmt"
	"hash/crc32"
	"math"
	"time"

	"kubelens-backend/internal/model"
)

var (
	mockNamespaceData = []string{"default", "kube-system", "monitoring", "production"}

	mockPodData = []model.PodSummary{
		{
			ID:        "pod-1",
			Name:      "nginx-deployment-7848d4b86f-9v8x2",
			Namespace: "default",
			NodeName:  "node-worker-1",
			Status:    model.PodStatusRunning,
			CPU:       "12m",
			Memory:    "45Mi",
			Age:       "4d",
			Restarts:  0,
		},
		{
			ID:        "pod-2",
			Name:      "redis-master-0",
			Namespace: "production",
			NodeName:  "node-worker-2",
			Status:    model.PodStatusRunning,
			CPU:       "45m",
			Memory:    "128Mi",
			Age:       "12d",
			Restarts:  2,
		},
		{
			ID:        "pod-3",
			Name:      "auth-service-v2-5f6b7c8d9-abcde",
			Namespace: "production",
			NodeName:  "node-worker-1",
			Status:    model.PodStatusPending,
			CPU:       "0m",
			Memory:    "0Mi",
			Age:       "2m",
			Restarts:  0,
		},
		{
			ID:        "pod-4",
			Name:      "prometheus-server-0",
			Namespace: "monitoring",
			NodeName:  "node-master-1",
			Status:    model.PodStatusRunning,
			CPU:       "120m",
			Memory:    "512Mi",
			Age:       "30d",
			Restarts:  1,
		},
		{
			ID:        "pod-5",
			Name:      "coredns-64897985d-m2q8l",
			Namespace: "kube-system",
			NodeName:  "node-master-1",
			Status:    model.PodStatusRunning,
			CPU:       "8m",
			Memory:    "18Mi",
			Age:       "45d",
			Restarts:  0,
		},
		{
			ID:        "pod-6",
			Name:      "payment-gateway-7f8d9a0b-12345",
			Namespace: "production",
			NodeName:  "node-worker-3",
			Status:    model.PodStatusFailed,
			CPU:       "0m",
			Memory:    "0Mi",
			Age:       "1h",
			Restarts:  5,
		},
	}

	mockNodeData = []model.NodeSummary{
		{
			Name:       "node-master-1",
			Status:     model.NodeStatusReady,
			Roles:      "control-plane,master",
			Age:        "45d",
			Version:    "v1.28.2",
			CPUUsage:   "18%",
			MemUsage:   "44%",
			CPUHistory: buildCPUHistory("node-master-1"),
		},
		{
			Name:       "node-worker-1",
			Status:     model.NodeStatusReady,
			Roles:      "worker",
			Age:        "45d",
			Version:    "v1.28.2",
			CPUUsage:   "65%",
			MemUsage:   "82%",
			CPUHistory: buildCPUHistory("node-worker-1"),
		},
		{
			Name:       "node-worker-2",
			Status:     model.NodeStatusReady,
			Roles:      "worker",
			Age:        "45d",
			Version:    "v1.28.2",
			CPUUsage:   "42%",
			MemUsage:   "55%",
			CPUHistory: buildCPUHistory("node-worker-2"),
		},
		{
			Name:       "node-worker-3",
			Status:     model.NodeStatusNotReady,
			Roles:      "worker",
			Age:        "12d",
			Version:    "v1.28.2",
			CPUUsage:   "0%",
			MemUsage:   "0%",
			CPUHistory: buildCPUHistory("node-worker-3"),
		},
	}

	mockPodEventData = map[string][]model.K8sEvent{
		"payment-gateway-7f8d9a0b-12345": {
			{
				Type:    "Warning",
				Reason:  "BackOff",
				Age:     "2m",
				From:    "kubelet",
				Message: "Back-off restarting failed container",
				Count:   12,
			},
			{
				Type:    "Warning",
				Reason:  "Failed",
				Age:     "3m",
				From:    "kubelet",
				Message: "Error: failed to connect to database endpoint",
				Count:   8,
			},
		},
	}

	mockPodLogData = map[string]string{
		"payment-gateway-7f8d9a0b-12345": `2024-03-01 10:00:05 INFO Starting payment gateway service...
2024-03-01 10:00:10 INFO Connecting to database...
2024-03-01 10:00:15 ERROR Database connection failed: Connection timeout
2024-03-01 10:00:15 FATAL Could not start service. Exiting.
2024-03-01 10:05:20 INFO Starting payment gateway service...
2024-03-01 10:05:25 ERROR Database connection failed: Connection timeout`,
	}

	defaultMockEvents = []model.K8sEvent{
		{
			Type:         "Normal",
			Reason:       "Scheduled",
			Age:          "5m",
			From:         "default-scheduler",
			Message:      "Successfully assigned workload",
			Resource:     "nginx-deployment-7848d4b86f-9v8x2",
			ResourceKind: "Pod",
			Namespace:    "default",
			Count:        1,
		},
		{
			Type:         "Normal",
			Reason:       "Pulled",
			Age:          "4m",
			From:         "kubelet",
			Message:      "Container image pulled",
			Resource:     "nginx-deployment-7848d4b86f-9v8x2",
			ResourceKind: "Pod",
			Namespace:    "default",
			Count:        1,
		},
	}

	defaultMockLogs = `2024-03-01 10:00:05 INFO Starting workload...
2024-03-01 10:00:10 INFO Health checks passed
2024-03-01 10:00:15 INFO Pod is running`
)

func mockNamespaces() []string {
	return append([]string(nil), mockNamespaceData...)
}

func mockPods() []model.PodSummary {
	return append([]model.PodSummary(nil), mockPodData...)
}

func mockNodes() []model.NodeSummary {
	out := make([]model.NodeSummary, len(mockNodeData))
	for i := range mockNodeData {
		out[i] = mockNodeData[i]
		out[i].CPUHistory = append([]model.CPUPoint(nil), mockNodeData[i].CPUHistory...)
	}
	return out
}

func mockPodEvents(name string) []model.K8sEvent {
	if events, ok := mockPodEventData[name]; ok {
		return append([]model.K8sEvent(nil), events...)
	}

	events := append([]model.K8sEvent(nil), defaultMockEvents...)
	events[0].Message = fmt.Sprintf("Successfully assigned workload for pod %s", name)
	return events
}

func mockPodLogs(name string) string {
	if logs, ok := mockPodLogData[name]; ok {
		return logs
	}
	return defaultMockLogs
}

func buildCPUHistory(seed string) []model.CPUPoint {
	const samples = 31
	points := make([]model.CPUPoint, 0, samples)
	now := time.Now()
	base := float64(crc32.ChecksumIEEE([]byte(seed))%35 + 20)
	phase := float64(crc32.ChecksumIEEE([]byte("phase:"+seed))%1000) / 1000

	for minutes := 60; minutes >= 0; minutes -= 2 {
		timestamp := now.Add(-time.Duration(minutes) * time.Minute)
		wave := math.Sin((float64(minutes)/60.0)*2*math.Pi + phase*2*math.Pi)
		value := int(base + wave*22)
		if value < 0 {
			value = 0
		}
		if value > 100 {
			value = 100
		}

		points = append(points, model.CPUPoint{
			Time:  timestamp.Format("15:04"),
			Value: value,
		})
	}

	return points
}
