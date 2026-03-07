package diagnostics

import (
	"strconv"
	"testing"

	"kubelens-backend/internal/model"
)

func BenchmarkBuildDiagnostics(b *testing.B) {
	pods, nodes := benchmarkClusterData(1200, 80)
	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_ = BuildDiagnostics(pods, nodes)
	}
}

func benchmarkClusterData(podCount, nodeCount int) ([]model.PodSummary, []model.NodeSummary) {
	pods := make([]model.PodSummary, 0, podCount)
	for i := 0; i < podCount; i++ {
		status := model.PodStatusRunning
		if i%20 == 0 {
			status = model.PodStatusPending
		}
		if i%40 == 0 {
			status = model.PodStatusFailed
		}

		restarts := int32(0)
		if i%15 == 0 {
			restarts = 4
		}

		pods = append(pods, model.PodSummary{
			Name:      "pod-" + strconv.Itoa(i),
			Namespace: "prod",
			Status:    status,
			Restarts:  restarts,
		})
	}

	nodes := make([]model.NodeSummary, 0, nodeCount)
	for i := 0; i < nodeCount; i++ {
		status := model.NodeStatusReady
		if i%12 == 0 {
			status = model.NodeStatusNotReady
		}
		nodes = append(nodes, model.NodeSummary{
			Name:   "node-" + strconv.Itoa(i),
			Status: status,
		})
	}

	return pods, nodes
}
