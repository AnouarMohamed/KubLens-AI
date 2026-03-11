package httpapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"kubelens-backend/internal/apperrors"
	"kubelens-backend/internal/auth"
	"kubelens-backend/internal/model"
)

func (s *Server) handleClusterInfo(w http.ResponseWriter, r *http.Request) {
	if selector, ok := s.cluster.(clusterSelector); ok {
		name := selector.ClusterName(r.Context())
		if info, found := selector.ClusterInfo(name); found {
			writeJSON(w, http.StatusOK, model.ClusterInfo{IsRealCluster: info.IsRealCluster})
			return
		}
	}

	writeJSON(w, http.StatusOK, model.ClusterInfo{IsRealCluster: s.cluster.IsRealCluster()})
}

func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.metrics.snapshot())
}

func (s *Server) handleNamespaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.cluster.ListNamespaces(r.Context()))
}

func (s *Server) handlePods(w http.ResponseWriter, r *http.Request) {
	pods, _ := s.cluster.Snapshot(r.Context())
	writeJSON(w, http.StatusOK, pods)
}

func (s *Server) handleNodes(w http.ResponseWriter, r *http.Request) {
	_, nodes := s.cluster.Snapshot(r.Context())
	writeJSON(w, http.StatusOK, nodes)
}

func (s *Server) handleResources(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	if kind == "" {
		writeError(w, http.StatusBadRequest, "resource kind is required")
		return
	}

	items, err := s.cluster.ListResources(r.Context(), kind)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, model.ResourceList{
		Kind:  kind,
		Items: items,
	})
}

func (s *Server) handleGetResourceYAML(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))

	yamlText, err := s.cluster.GetResourceYAML(r.Context(), kind, namespace, name)
	if err != nil {
		handleActionError(w, err, "Resource not found")
		return
	}

	writeJSON(w, http.StatusOK, model.ResourceManifest{YAML: yamlText})
}

func (s *Server) handleApplyResourceYAML(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))

	var req model.ResourceManifest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	pods, nodes := s.cluster.Snapshot(r.Context())
	risk := s.evaluateManifestRisk(req.YAML, pods, nodes)
	force := queryBool(r, "force")
	if risk.Score >= 50 && !force {
		writeJSON(w, http.StatusAccepted, model.ResourceApplyRiskResponse{
			Message:       "Risk guard blocked apply. Review the report and retry with force=true if override is justified.",
			RequiresForce: true,
			Report:        risk,
		})
		return
	}
	if risk.Score >= 50 && force && s.audit != nil {
		entry := model.AuditEntry{
			Timestamp: s.now().UTC().Format(time.RFC3339),
			RequestID: middleware.GetReqID(r.Context()),
			Method:    r.Method,
			Path:      sanitizeAuditPath(r.URL.Path),
			Action:    fmt.Sprintf("resource.apply.force_override riskScore=%d", risk.Score),
			Status:    http.StatusOK,
			ClientIP:  sanitizeClientIP(r.RemoteAddr),
			Success:   true,
		}
		if principal, ok := auth.PrincipalFromContext(r.Context()); ok {
			entry.User = principal.User
			entry.Role = auth.RoleLabel(principal.Role)
		}
		s.audit.append(entry)
	}

	result, err := s.cluster.ApplyResourceYAML(r.Context(), kind, namespace, name, req.YAML)
	if err != nil {
		handleActionError(w, err, "Resource not found")
		return
	}

	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleScaleResource(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))

	var req model.ScaleRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := s.cluster.ScaleResource(r.Context(), kind, namespace, name, req.Replicas)
	if err != nil {
		handleActionError(w, err, "Resource not found")
		return
	}

	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleRestartResource(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))

	result, err := s.cluster.RestartResource(r.Context(), kind, namespace, name)
	if err != nil {
		handleActionError(w, err, "Resource not found")
		return
	}
	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleRollbackResource(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))

	result, err := s.cluster.RollbackResource(r.Context(), kind, namespace, name)
	if err != nil {
		handleActionError(w, err, "Resource not found")
		return
	}
	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.cluster.ListClusterEvents(r.Context()))
}

func (s *Server) handleCreatePod(w http.ResponseWriter, r *http.Request) {
	var req model.PodCreateRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := s.cluster.CreatePod(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handlePodEvents(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	writeJSON(w, http.StatusOK, s.cluster.PodEvents(r.Context(), namespace, name))
}

func (s *Server) handlePodLogs(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	container := strings.TrimSpace(r.URL.Query().Get("container"))
	lines := parsePositiveIntWithMax(r.URL.Query().Get("lines"), 50, 500)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte(s.cluster.PodLogs(r.Context(), namespace, name, container, lines)))
}

func (s *Server) handlePodLogsStream(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	container := strings.TrimSpace(r.URL.Query().Get("container"))
	lines := parsePositiveIntWithMax(r.URL.Query().Get("lines"), 50, 500)

	stream, err := s.cluster.StreamPodLogs(r.Context(), namespace, name, container, lines)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to stream pod logs")
		return
	}
	defer stream.Close()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	_, _ = io.Copy(w, stream)
}

func (s *Server) handlePodDescribe(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	pod, err := s.cluster.PodDetail(r.Context(), namespace, name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Pod not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "Failed to describe pod")
		return
	}
	events := s.cluster.PodEvents(r.Context(), namespace, name)

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte(renderPodDescribe(pod, events)))
}

func (s *Server) handleRestartPod(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	result, err := s.cluster.RestartPod(r.Context(), namespace, name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Pod not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleDeletePod(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	result, err := s.cluster.DeletePod(r.Context(), namespace, name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Pod not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handlePodDetail(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	pod, err := s.cluster.PodDetail(r.Context(), namespace, name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Pod not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "Failed to fetch pod details")
		return
	}
	writeJSON(w, http.StatusOK, pod)
}

func (s *Server) handleNodeDetail(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	node, err := s.cluster.NodeDetail(r.Context(), name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Node not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "Failed to fetch node details")
		return
	}
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleCordonNode(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	result, err := s.cluster.CordonNode(r.Context(), name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Node not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.currentClusterStats(r.Context()))
}

func (s *Server) handleDiagnostics(w http.ResponseWriter, r *http.Request) {
	report := s.runDiagnostics(r.Context())
	writeJSON(w, http.StatusOK, s.mapDiagnosticsReport(report))
}

func countPods(pods []model.PodSummary, status model.PodStatus) int {
	count := 0
	for _, pod := range pods {
		if pod.Status == status {
			count++
		}
	}
	return count
}

func (s *Server) currentClusterStats(ctx context.Context) model.ClusterStats {
	pods, nodes := s.cluster.Snapshot(ctx)
	return model.ClusterStats{
		Pods: model.PodStats{
			Total:   len(pods),
			Running: countPods(pods, model.PodStatusRunning),
			Pending: countPods(pods, model.PodStatusPending),
			Failed:  countPods(pods, model.PodStatusFailed),
		},
		Nodes: model.NodeStats{
			Total:    len(nodes),
			Ready:    countNodes(nodes, model.NodeStatusReady),
			NotReady: countNodesNotReady(nodes),
		},
		Cluster: clusterCapacityFromNodes(nodes, s.cluster.IsRealCluster()),
	}
}

func countNodes(nodes []model.NodeSummary, status model.NodeStatus) int {
	count := 0
	for _, node := range nodes {
		if node.Status == status {
			count++
		}
	}
	return count
}

func countNodesNotReady(nodes []model.NodeSummary) int {
	count := 0
	for _, node := range nodes {
		if node.Status != model.NodeStatusReady {
			count++
		}
	}
	return count
}

func clusterCapacityFromNodes(nodes []model.NodeSummary, isRealCluster bool) model.ClusterCapacity {
	if !isRealCluster {
		return model.ClusterCapacity{
			CPU:     "34%",
			Memory:  "58%",
			Storage: "22%",
		}
	}

	cpu, hasCPU := averageNodeUsage(nodes, func(node model.NodeSummary) string { return node.CPUUsage })
	memory, hasMemory := averageNodeUsage(nodes, func(node model.NodeSummary) string { return node.MemUsage })

	cpuValue := "N/A"
	if hasCPU {
		cpuValue = formatPercent(cpu)
	}

	memoryValue := "N/A"
	if hasMemory {
		memoryValue = formatPercent(memory)
	}

	return model.ClusterCapacity{
		CPU:     cpuValue,
		Memory:  memoryValue,
		Storage: "N/A",
	}
}

func averageNodeUsage(nodes []model.NodeSummary, read func(model.NodeSummary) string) (float64, bool) {
	var (
		total float64
		count float64
	)

	for _, node := range nodes {
		value, ok := parsePercent(read(node))
		if !ok {
			continue
		}
		total += value
		count++
	}

	if count == 0 {
		return 0, false
	}

	return total / count, true
}

func parsePercent(raw string) (float64, bool) {
	trimmed := strings.TrimSpace(strings.TrimSuffix(raw, "%"))
	if trimmed == "" {
		return 0, false
	}

	value, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return 0, false
	}
	if value < 0 {
		value = 0
	}
	if value > 100 {
		value = 100
	}

	return value, true
}

func formatPercent(value float64) string {
	return strconv.Itoa(int(value+0.5)) + "%"
}

func parsePositiveIntWithMax(raw string, fallback int, max int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value <= 0 {
		return fallback
	}
	if max > 0 && value > max {
		return max
	}
	return value
}

func handleActionError(w http.ResponseWriter, err error, notFoundMessage string) {
	if errors.Is(err, apperrors.ErrNotFound) {
		writeError(w, http.StatusNotFound, notFoundMessage)
		return
	}

	writeError(w, http.StatusBadRequest, err.Error())
}
