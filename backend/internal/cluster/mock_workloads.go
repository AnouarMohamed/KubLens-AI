package cluster

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"kubelens-backend/internal/model"
)

var readyCountPattern = regexp.MustCompile(`^(\d+)/(\d+)\s+Ready$`)

func mockCatalogResourceStore() map[string][]model.ResourceRecord {
	return map[string][]model.ResourceRecord{
		"deployments": {
			{ID: "deploy-1", Name: "payment-gateway", Namespace: "production", Status: "3/3 Ready", Age: "12d", Summary: "RollingUpdate"},
			{ID: "deploy-2", Name: "checkout-api", Namespace: "production", Status: "2/2 Ready", Age: "20d", Summary: "RollingUpdate"},
		},
		"replicasets": {
			{ID: "rs-1", Name: "payment-gateway-85fd88d5d6", Namespace: "production", Status: "3/3 Ready", Age: "4d", Summary: "Observed generation 3"},
		},
		"statefulsets": {
			{ID: "st-1", Name: "redis", Namespace: "production", Status: "1/1 Ready", Age: "25d", Summary: "Service redis-headless"},
		},
		"daemonsets": {
			{ID: "ds-1", Name: "node-exporter", Namespace: "monitoring", Status: "4/4 Ready", Age: "30d", Summary: "Updated 4"},
		},
		"jobs": {
			{ID: "job-1", Name: "db-backfill-20260306", Namespace: "production", Status: "Succeeded (1)", Age: "2h", Summary: "Completions: 1"},
		},
		"cronjobs": {
			{ID: "cron-1", Name: "nightly-report", Namespace: "production", Status: "Active", Age: "40d", Summary: "Schedule: 0 1 * * *"},
		},
		"services": {
			{ID: "svc-1", Name: "payment-gateway", Namespace: "production", Status: "ClusterIP", Age: "60d", Summary: "ClusterIP 10.0.0.2, Ports 80"},
		},
		"ingresses": {
			{ID: "ing-1", Name: "public-api", Namespace: "production", Status: "Address assigned", Age: "50d", Summary: "api.example.com"},
		},
		"networkpolicies": {
			{ID: "np-1", Name: "deny-by-default", Namespace: "production", Status: "Active", Age: "40d", Summary: "Ingress rules 1, Egress rules 1"},
		},
		"configmaps": {
			{ID: "cm-1", Name: "payment-config", Namespace: "production", Status: "Active", Age: "14d", Summary: "Keys: 5"},
		},
		"secrets": {
			{ID: "sec-1", Name: "payment-secrets", Namespace: "production", Status: "Active", Age: "14d", Summary: "Type: Opaque, Keys: 3"},
		},
		"persistentvolumes": {
			{ID: "pv-1", Name: "pv-data-001", Status: "Bound", Age: "90d", Summary: "Capacity: 100Gi"},
		},
		"persistentvolumeclaims": {
			{ID: "pvc-1", Name: "redis-data", Namespace: "production", Status: "Bound", Age: "35d", Summary: "Storage: 20Gi"},
		},
		"storageclasses": {
			{ID: "sc-1", Name: "standard-rwo", Status: "Default", Age: "180d", Summary: "kubernetes.io/gce-pd"},
		},
		"serviceaccounts": {
			{ID: "sa-1", Name: "payment-runner", Namespace: "production", Status: "Active", Age: "12d", Summary: "Secrets: 1"},
		},
		"rbac": {
			{ID: "rbac-1", Name: "payment-editor", Namespace: "production", Status: "Role", Age: "12d", Summary: "Rules: 6"},
			{ID: "rbac-2", Name: "payment-editor-binding", Namespace: "production", Status: "RoleBinding", Age: "12d", Summary: "Subjects: 2"},
		},
	}
}

func mockCatalogManifestStore() map[string]string {
	store := map[string]string{}
	resources := mockCatalogResourceStore()
	for kind, records := range resources {
		for _, record := range records {
			if record.Namespace == "" {
				continue
			}
			if kind != "deployments" && kind != "statefulsets" && kind != "jobs" {
				continue
			}
			key := mockWorkloadKey(kind, record.Namespace, record.Name)
			store[key] = renderDefaultWorkloadManifest(kind, record)
		}
	}
	return store
}

func (s *Service) mockWorkloadResources(kind string) []model.ResourceRecord {
	s.mockMu.RLock()
	defer s.mockMu.RUnlock()

	records := s.mockResources[kind]
	out := make([]model.ResourceRecord, len(records))
	copy(out, records)
	return out
}

func (s *Service) mockGetResourceYAML(kind, namespace, name string) (string, error) {
	normalizedKind, err := normalizeWorkloadKind(kind)
	if err != nil {
		return "", err
	}

	s.mockMu.RLock()
	defer s.mockMu.RUnlock()

	key := mockWorkloadKey(normalizedKind, namespace, name)
	if manifest, ok := s.mockManifests[key]; ok {
		return manifest, nil
	}

	record, ok := findMockResource(s.mockResources[normalizedKind], namespace, name)
	if !ok {
		return "", ErrNotFound
	}

	return renderDefaultWorkloadManifest(normalizedKind, record), nil
}

func (s *Service) mockApplyResourceYAML(kind, namespace, name, manifestYAML string) (model.ActionResult, error) {
	normalizedKind, err := normalizeWorkloadKind(kind)
	if err != nil {
		return model.ActionResult{}, err
	}
	if strings.TrimSpace(manifestYAML) == "" {
		return model.ActionResult{}, errors.New("yaml content is required")
	}

	s.mockMu.Lock()
	defer s.mockMu.Unlock()

	records := s.mockResources[normalizedKind]
	idx := findMockResourceIndex(records, namespace, name)
	if idx < 0 {
		return model.ActionResult{}, ErrNotFound
	}

	records[idx].Summary = "Manifest updated"
	records[idx].Age = "just now"
	s.mockResources[normalizedKind] = records
	s.mockManifests[mockWorkloadKey(normalizedKind, namespace, name)] = manifestYAML

	return model.ActionResult{Success: true, Message: fmt.Sprintf("Applied YAML to %s %s/%s", normalizedKind, namespace, name)}, nil
}

func (s *Service) mockScaleResource(kind, namespace, name string, replicas int32) (model.ActionResult, error) {
	normalizedKind, err := normalizeWorkloadKind(kind)
	if err != nil {
		return model.ActionResult{}, err
	}
	if replicas < 0 {
		return model.ActionResult{}, errors.New("replicas must be >= 0")
	}

	s.mockMu.Lock()
	defer s.mockMu.Unlock()

	records := s.mockResources[normalizedKind]
	idx := findMockResourceIndex(records, namespace, name)
	if idx < 0 {
		return model.ActionResult{}, ErrNotFound
	}

	switch normalizedKind {
	case "deployments", "statefulsets":
		records[idx].Status = fmt.Sprintf("%d/%d Ready", replicas, replicas)
		records[idx].Summary = fmt.Sprintf("Scaled to %d replicas", replicas)
	case "jobs":
		records[idx].Status = fmt.Sprintf("Parallelism: %d", replicas)
		records[idx].Summary = fmt.Sprintf("Completions: %d", replicas)
	}
	records[idx].Age = "just now"
	s.mockResources[normalizedKind] = records

	return model.ActionResult{Success: true, Message: fmt.Sprintf("Scaled %s %s/%s to %d", normalizedKind, namespace, name, replicas)}, nil
}

func (s *Service) mockRestartResource(kind, namespace, name string) (model.ActionResult, error) {
	normalizedKind, err := normalizeWorkloadKind(kind)
	if err != nil {
		return model.ActionResult{}, err
	}

	s.mockMu.Lock()
	defer s.mockMu.Unlock()

	records := s.mockResources[normalizedKind]
	idx := findMockResourceIndex(records, namespace, name)
	if idx < 0 {
		return model.ActionResult{}, ErrNotFound
	}

	if normalizedKind == "jobs" {
		newName := buildRerunJobName(name)
		clone := records[idx]
		clone.ID = fmt.Sprintf("job-rerun-%d", time.Now().UnixNano())
		clone.Name = newName
		clone.Status = "Running"
		clone.Age = "just now"
		clone.Summary = fmt.Sprintf("Rerun for %s", name)
		records = append(records, clone)
		s.mockResources[normalizedKind] = records
		return model.ActionResult{Success: true, Message: fmt.Sprintf("Created rerun job %s/%s", namespace, newName)}, nil
	}

	records[idx].Age = "just now"
	records[idx].Summary = "Restart triggered"
	s.mockResources[normalizedKind] = records

	return model.ActionResult{Success: true, Message: fmt.Sprintf("Restart triggered for %s %s/%s", normalizedKind, namespace, name)}, nil
}

func (s *Service) mockRollbackResource(kind, namespace, name string) (model.ActionResult, error) {
	normalizedKind, err := normalizeWorkloadKind(kind)
	if err != nil {
		return model.ActionResult{}, err
	}
	if normalizedKind != "deployments" {
		return model.ActionResult{}, errors.New("rollback is currently supported for deployments only")
	}

	s.mockMu.Lock()
	defer s.mockMu.Unlock()

	records := s.mockResources[normalizedKind]
	idx := findMockResourceIndex(records, namespace, name)
	if idx < 0 {
		return model.ActionResult{}, ErrNotFound
	}

	replicas := extractDesiredReplicas(records[idx].Status, 1)
	records[idx].Status = fmt.Sprintf("%d/%d Ready", replicas, replicas)
	records[idx].Summary = "Rolled back to previous revision"
	records[idx].Age = "just now"
	s.mockResources[normalizedKind] = records

	return model.ActionResult{Success: true, Message: fmt.Sprintf("Rolled back deployment %s/%s", namespace, name)}, nil
}

func findMockResource(records []model.ResourceRecord, namespace, name string) (model.ResourceRecord, bool) {
	for _, record := range records {
		if record.Namespace == namespace && record.Name == name {
			return record, true
		}
	}
	return model.ResourceRecord{}, false
}

func findMockResourceIndex(records []model.ResourceRecord, namespace, name string) int {
	for i := range records {
		if records[i].Namespace == namespace && records[i].Name == name {
			return i
		}
	}
	return -1
}

func mockWorkloadKey(kind, namespace, name string) string {
	return fmt.Sprintf("%s/%s/%s", kind, namespace, name)
}

func renderDefaultWorkloadManifest(kind string, record model.ResourceRecord) string {
	replicas := extractDesiredReplicas(record.Status, 1)
	appLabel := sanitizeLabel(record.Name)

	switch kind {
	case "deployments":
		return fmt.Sprintf(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: %s
  namespace: %s
spec:
  replicas: %d
  selector:
    matchLabels:
      app: %s
  template:
    metadata:
      labels:
        app: %s
    spec:
      containers:
      - name: app
        image: nginx:latest
`, record.Name, record.Namespace, replicas, appLabel, appLabel)
	case "statefulsets":
		return fmt.Sprintf(`apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: %s
  namespace: %s
spec:
  serviceName: %s-headless
  replicas: %d
  selector:
    matchLabels:
      app: %s
  template:
    metadata:
      labels:
        app: %s
    spec:
      containers:
      - name: app
        image: nginx:latest
`, record.Name, record.Namespace, record.Name, replicas, appLabel, appLabel)
	case "jobs":
		return fmt.Sprintf(`apiVersion: batch/v1
kind: Job
metadata:
  name: %s
  namespace: %s
spec:
  parallelism: %d
  completions: %d
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: job
        image: busybox
        command: ["sh", "-c", "echo hello"]
`, record.Name, record.Namespace, replicas, replicas)
	default:
		return ""
	}
}

func extractDesiredReplicas(status string, fallback int32) int32 {
	matches := readyCountPattern.FindStringSubmatch(status)
	if len(matches) != 3 {
		return fallback
	}
	desired, err := strconv.ParseInt(matches[2], 10, 32)
	if err != nil {
		return fallback
	}
	if desired < 0 {
		return fallback
	}
	return int32(desired)
}

func sanitizeLabel(value string) string {
	lower := strings.ToLower(value)
	lower = strings.ReplaceAll(lower, "_", "-")
	lower = strings.ReplaceAll(lower, " ", "-")
	if lower == "" {
		return "app"
	}
	return lower
}
