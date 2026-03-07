package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"kubelens-backend/internal/model"
)

const (
	defaultPredictorTimeout = 4 * time.Second
	maxPredictionItems      = 10
)

type predictorRequest struct {
	Pods      []model.PodSummary  `json:"pods"`
	Nodes     []model.NodeSummary `json:"nodes"`
	Events    []model.K8sEvent    `json:"events"`
	Timestamp string              `json:"timestamp"`
}

type predictionProvider interface {
	Predict(ctx context.Context, input predictorRequest) (model.PredictionsResult, error)
}

type predictorClient struct {
	baseURL string
	client  *http.Client
}

func newPredictorClient(baseURL string, timeout time.Duration) *predictorClient {
	if timeout <= 0 {
		timeout = defaultPredictorTimeout
	}

	return &predictorClient{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		client:  &http.Client{Timeout: timeout},
	}
}

func (p *predictorClient) Predict(ctx context.Context, input predictorRequest) (model.PredictionsResult, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return model.PredictionsResult{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/predict", bytes.NewReader(body))
	if err != nil {
		return model.PredictionsResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return model.PredictionsResult{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return model.PredictionsResult{}, fmt.Errorf("predictor status %d", resp.StatusCode)
	}

	var out model.PredictionsResult
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return model.PredictionsResult{}, err
	}
	if out.GeneratedAt == "" {
		out.GeneratedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if out.Source == "" {
		out.Source = "python-service"
	}

	return out, nil
}

func (s *Server) handlePredictions(w http.ResponseWriter, r *http.Request) {
	forceRefresh := queryBool(r, "force")
	if !forceRefresh {
		if cached, ok := s.predictionsFromCache(); ok {
			writeJSON(w, http.StatusOK, cached)
			return
		}
	}

	pods, nodes := s.cluster.Snapshot(r.Context())
	events := s.cluster.ListClusterEvents(r.Context())
	request := predictorRequest{
		Pods:      pods,
		Nodes:     nodes,
		Events:    events,
		Timestamp: s.now().UTC().Format(time.RFC3339),
	}

	if s.predictor != nil {
		predictions, err := s.predictor.Predict(r.Context(), request)
		if err == nil {
			s.storePredictions(predictions)
			writeJSON(w, http.StatusOK, predictions)
			return
		}
		s.logger.Warn("predictor service unavailable, using local fallback", "error", err.Error())
	}

	fallback := buildLocalPredictions(pods, nodes, events, s.now())
	s.storePredictions(fallback)
	writeJSON(w, http.StatusOK, fallback)
}

func queryBool(r *http.Request, key string) bool {
	switch strings.ToLower(strings.TrimSpace(r.URL.Query().Get(key))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func (s *Server) invalidatePredictionsCache() {
	if s.predictionsTTL <= 0 {
		return
	}

	s.predictionsMu.Lock()
	s.predictionsCache = predictionsCacheEntry{}
	s.predictionsMu.Unlock()
}

func buildLocalPredictions(pods []model.PodSummary, nodes []model.NodeSummary, events []model.K8sEvent, now time.Time) model.PredictionsResult {
	items := make([]model.IncidentPrediction, 0, len(pods)+len(nodes))
	eventPressure := countWarningEvents(events)

	for _, pod := range pods {
		score := 0
		signals := make([]model.PredictionSignal, 0, 4)

		switch pod.Status {
		case model.PodStatusFailed:
			score += 60
			signals = append(signals, model.PredictionSignal{Key: "status", Value: "Failed"})
		case model.PodStatusPending:
			score += 35
			signals = append(signals, model.PredictionSignal{Key: "status", Value: "Pending"})
		case model.PodStatusUnknown:
			score += 20
			signals = append(signals, model.PredictionSignal{Key: "status", Value: "Unknown"})
		}

		if pod.Restarts > 0 {
			restartRisk := int(pod.Restarts) * 8
			if restartRisk > 40 {
				restartRisk = 40
			}
			score += restartRisk
			signals = append(signals, model.PredictionSignal{Key: "restarts", Value: strconv.Itoa(int(pod.Restarts))})
		}

		if cpuMilli := parseCPUMilli(pod.CPU); cpuMilli >= 400 {
			score += 10
			signals = append(signals, model.PredictionSignal{Key: "cpu", Value: pod.CPU})
		}

		if memMi := parseMemoryMi(pod.Memory); memMi >= 512 {
			score += 10
			signals = append(signals, model.PredictionSignal{Key: "memory", Value: pod.Memory})
		}

		if eventPressure > 0 && pod.Status != model.PodStatusRunning {
			score += minInt(12, eventPressure/2)
		}

		score = clampInt(score, 0, 100)
		if score < 35 {
			continue
		}

		recommendation := "Review recent pod events and logs; verify dependencies and resource requests."
		if pod.Status == model.PodStatusPending {
			recommendation = "Inspect scheduler constraints, image pull status, and resource requests."
		} else if pod.Status == model.PodStatusFailed {
			recommendation = "Investigate crash causes, validate probes, and consider rollback to last healthy revision."
		}

		confidence := clampInt(45+int(math.Round(float64(score)*0.45)), 50, 95)
		items = append(items, model.IncidentPrediction{
			ID:             "pod-" + pod.ID,
			ResourceKind:   "Pod",
			Resource:       pod.Name,
			Namespace:      pod.Namespace,
			RiskScore:      score,
			Confidence:     confidence,
			Summary:        fmt.Sprintf("%s pod with %d restarts and status %s.", pod.Name, pod.Restarts, pod.Status),
			Recommendation: recommendation,
			Signals:        signals,
		})
	}

	for _, node := range nodes {
		score := 0
		signals := make([]model.PredictionSignal, 0, 3)

		if node.Status == model.NodeStatusNotReady {
			score += 75
			signals = append(signals, model.PredictionSignal{Key: "status", Value: "NotReady"})
		}

		if cpu, ok := parsePercent(node.CPUUsage); ok && cpu >= 90 {
			score += 20
			signals = append(signals, model.PredictionSignal{Key: "cpuUsage", Value: node.CPUUsage})
		}

		if mem, ok := parsePercent(node.MemUsage); ok && mem >= 90 {
			score += 20
			signals = append(signals, model.PredictionSignal{Key: "memUsage", Value: node.MemUsage})
		}

		score = clampInt(score, 0, 100)
		if score < 45 {
			continue
		}

		confidence := clampInt(50+score/2, 55, 96)
		items = append(items, model.IncidentPrediction{
			ID:             "node-" + strings.ToLower(node.Name),
			ResourceKind:   "Node",
			Resource:       node.Name,
			RiskScore:      score,
			Confidence:     confidence,
			Summary:        fmt.Sprintf("Node %s shows elevated operational risk.", node.Name),
			Recommendation: "Inspect kubelet health, node conditions, and workload pressure before scheduling more pods.",
			Signals:        signals,
		})
	}

	sort.SliceStable(items, func(i, j int) bool {
		if items[i].RiskScore == items[j].RiskScore {
			return items[i].Confidence > items[j].Confidence
		}
		return items[i].RiskScore > items[j].RiskScore
	})

	if len(items) > maxPredictionItems {
		items = items[:maxPredictionItems]
	}

	return model.PredictionsResult{
		Source:      "local-fallback",
		GeneratedAt: now.UTC().Format(time.RFC3339),
		Items:       items,
	}
}

func countWarningEvents(events []model.K8sEvent) int {
	total := 0
	for _, event := range events {
		eventType := strings.ToLower(strings.TrimSpace(event.Type))
		reason := strings.ToLower(strings.TrimSpace(event.Reason))
		if eventType == "warning" {
			total++
			continue
		}
		if reason == "backoff" || reason == "failed" || reason == "unhealthy" || reason == "oomkilled" {
			total++
		}
	}
	return total
}

func parseCPUMilli(raw string) int {
	value := strings.TrimSpace(strings.ToLower(raw))
	if value == "" || value == "n/a" {
		return 0
	}

	if strings.HasSuffix(value, "m") {
		numeric := strings.TrimSuffix(value, "m")
		parsed, err := strconv.ParseFloat(numeric, 64)
		if err != nil {
			return 0
		}
		return int(parsed)
	}

	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0
	}
	return int(parsed * 1000)
}

func parseMemoryMi(raw string) int {
	value := strings.TrimSpace(strings.ToLower(raw))
	if value == "" || value == "n/a" {
		return 0
	}

	switch {
	case strings.HasSuffix(value, "mi"):
		numeric := strings.TrimSuffix(value, "mi")
		parsed, err := strconv.ParseFloat(numeric, 64)
		if err != nil {
			return 0
		}
		return int(parsed)
	case strings.HasSuffix(value, "gi"):
		numeric := strings.TrimSuffix(value, "gi")
		parsed, err := strconv.ParseFloat(numeric, 64)
		if err != nil {
			return 0
		}
		return int(parsed * 1024)
	case strings.HasSuffix(value, "ki"):
		numeric := strings.TrimSuffix(value, "ki")
		parsed, err := strconv.ParseFloat(numeric, 64)
		if err != nil {
			return 0
		}
		return int(parsed / 1024)
	default:
		numeric := strings.TrimRight(value, "b")
		parsed, err := strconv.ParseFloat(numeric, 64)
		if err != nil {
			return 0
		}
		// If no explicit unit is provided, treat as bytes.
		return int(parsed / (1024 * 1024))
	}
}

func clampInt(value, low, high int) int {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (s *Server) predictionsFromCache() (model.PredictionsResult, bool) {
	if s.predictionsTTL <= 0 {
		return model.PredictionsResult{}, false
	}

	now := s.now()

	s.predictionsMu.RLock()
	defer s.predictionsMu.RUnlock()

	if now.After(s.predictionsCache.expiresAt) {
		return model.PredictionsResult{}, false
	}

	return clonePredictionsResult(s.predictionsCache.data), true
}

func (s *Server) storePredictions(result model.PredictionsResult) {
	if s.predictionsTTL <= 0 {
		return
	}

	s.predictionsMu.Lock()
	s.predictionsCache = predictionsCacheEntry{
		data:      clonePredictionsResult(result),
		expiresAt: s.now().Add(s.predictionsTTL),
	}
	s.predictionsMu.Unlock()
}

func clonePredictionsResult(in model.PredictionsResult) model.PredictionsResult {
	out := in
	out.Items = make([]model.IncidentPrediction, len(in.Items))
	for i := range in.Items {
		out.Items[i] = in.Items[i]
		out.Items[i].Signals = append([]model.PredictionSignal(nil), in.Items[i].Signals...)
	}
	return out
}
