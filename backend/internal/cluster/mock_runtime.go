package cluster

import (
	"fmt"
	"strings"
	"time"

	"kubelens-backend/internal/model"
)

func (s *Service) mockSnapshot() ([]model.PodSummary, []model.NodeSummary) {
	s.mockMu.RLock()
	defer s.mockMu.RUnlock()
	return append([]model.PodSummary(nil), s.mockPods...), cloneNodeSummaries(s.mockNodes)
}

func (s *Service) mockNamespaceList() []string {
	s.mockMu.RLock()
	defer s.mockMu.RUnlock()
	return append([]string(nil), s.mockNamespaces...)
}

func (s *Service) mockPodDetail(namespace, name string) (model.PodDetail, error) {
	s.mockMu.RLock()
	defer s.mockMu.RUnlock()

	for _, pod := range s.mockPods {
		if pod.Namespace != namespace || pod.Name != name {
			continue
		}

		return model.PodDetail{
			PodSummary: pod,
			NodeName:   "node-worker-1",
			HostIP:     "10.128.0.2",
			PodIP:      "10.244.1.45",
			Containers: []model.ContainerSpec{
				{
					Name:  "main",
					Image: "nginx:latest",
					Env: []model.ContainerEnv{
						{Name: "APP_ENV", Value: "production"},
						{Name: "LOG_LEVEL", Value: "info"},
					},
					VolumeMounts: []model.VolumeMount{{Name: "config", MountPath: "/etc/app"}},
					Resources: &model.ContainerResources{
						Requests: &model.ResourcePairs{CPU: "100m", Memory: "128Mi"},
						Limits:   &model.ResourcePairs{CPU: "500m", Memory: "512Mi"},
					},
				},
			},
			Volumes: []model.NamedVolume{{Name: "config"}},
		}, nil
	}

	return model.PodDetail{}, ErrNotFound
}

func (s *Service) mockNodeDetail(name string) (model.NodeDetail, error) {
	s.mockMu.RLock()
	defer s.mockMu.RUnlock()

	for _, node := range s.mockNodes {
		if node.Name != name {
			continue
		}

		return model.NodeDetail{
			NodeSummary: node,
			Capacity:    model.ResourceCapacity{CPU: "8", Memory: "32Gi", Pods: "110"},
			Allocatable: model.ResourceCapacity{CPU: "7.8", Memory: "30Gi", Pods: "110"},
			Conditions: []model.NodeCondition{
				{
					Type:               "Ready",
					Status:             boolToStatus(node.Status == model.NodeStatusReady),
					LastTransitionTime: "2026-03-06 08:00:00",
					Reason:             "KubeletReady",
					Message:            "kubelet is posting ready status",
				},
				{
					Type:               "DiskPressure",
					Status:             "False",
					LastTransitionTime: "2026-03-06 08:00:00",
					Reason:             "KubeletHasNoDiskPressure",
					Message:            "kubelet has no disk pressure",
				},
			},
			Addresses: []model.NodeAddress{
				{Type: "InternalIP", Address: "10.128.0.1"},
				{Type: "Hostname", Address: name},
			},
		}, nil
	}

	return model.NodeDetail{}, ErrNotFound
}

func (s *Service) mockClusterEvents() []model.K8sEvent {
	s.mockMu.RLock()
	defer s.mockMu.RUnlock()

	events := make([]model.K8sEvent, 0, len(s.mockPods)+2)
	for _, pod := range s.mockPods {
		eventType := "Normal"
		reason := "Running"
		message := fmt.Sprintf("Pod %s/%s is healthy", pod.Namespace, pod.Name)
		if pod.Status == model.PodStatusFailed {
			eventType = "Warning"
			reason = "BackOff"
			message = fmt.Sprintf("Pod %s/%s is restarting", pod.Namespace, pod.Name)
		}

		events = append(events, model.K8sEvent{
			Type:    eventType,
			Reason:  reason,
			Age:     "1m",
			From:    "kubelet",
			Message: message,
			Count:   1,
		})
	}

	if len(events) == 0 {
		return []model.K8sEvent{{
			Type:    "Normal",
			Reason:  "Synced",
			Age:     "1m",
			From:    "controller-manager",
			Message: "Cluster event stream is healthy",
			Count:   1,
		}}
	}

	return events
}

func (s *Service) mockCreatePod(namespace, name, image string) (model.ActionResult, error) {
	s.mockMu.Lock()
	defer s.mockMu.Unlock()

	for _, pod := range s.mockPods {
		if pod.Namespace == namespace && pod.Name == name {
			return model.ActionResult{}, fmt.Errorf("pod %s/%s already exists", namespace, name)
		}
	}

	s.mockPods = append(s.mockPods, model.PodSummary{
		ID:        fmt.Sprintf("mock-%d", time.Now().UnixNano()),
		Name:      name,
		Namespace: namespace,
		Status:    model.PodStatusPending,
		CPU:       "0m",
		Memory:    "0Mi",
		Age:       "just now",
		Restarts:  0,
	})

	if !containsString(s.mockNamespaces, namespace) {
		s.mockNamespaces = append(s.mockNamespaces, namespace)
	}

	return model.ActionResult{Success: true, Message: fmt.Sprintf("Pod %s/%s created (%s)", namespace, name, image)}, nil
}

func (s *Service) mockRestartPod(namespace, name string) (model.ActionResult, error) {
	s.mockMu.Lock()
	defer s.mockMu.Unlock()

	for i := range s.mockPods {
		if s.mockPods[i].Namespace != namespace || s.mockPods[i].Name != name {
			continue
		}
		s.mockPods[i].Restarts++
		s.mockPods[i].Status = model.PodStatusRunning
		s.mockPods[i].Age = "just now"
		return model.ActionResult{Success: true, Message: fmt.Sprintf("Restarted %s/%s", namespace, name)}, nil
	}

	return model.ActionResult{}, ErrNotFound
}

func (s *Service) mockDeletePod(namespace, name string) (model.ActionResult, error) {
	s.mockMu.Lock()
	defer s.mockMu.Unlock()

	for i := range s.mockPods {
		if s.mockPods[i].Namespace != namespace || s.mockPods[i].Name != name {
			continue
		}
		s.mockPods = append(s.mockPods[:i], s.mockPods[i+1:]...)
		return model.ActionResult{Success: true, Message: fmt.Sprintf("Deleted %s/%s", namespace, name)}, nil
	}

	return model.ActionResult{}, ErrNotFound
}

func (s *Service) mockCordonNode(name string) (model.ActionResult, error) {
	s.mockMu.Lock()
	defer s.mockMu.Unlock()

	for i := range s.mockNodes {
		if s.mockNodes[i].Name != name {
			continue
		}
		if !strings.Contains(s.mockNodes[i].Roles, "cordoned") {
			s.mockNodes[i].Roles = strings.TrimSpace(s.mockNodes[i].Roles + ",cordoned")
		}
		return model.ActionResult{Success: true, Message: fmt.Sprintf("Node %s cordoned", name)}, nil
	}

	return model.ActionResult{}, ErrNotFound
}

func (s *Service) mockUncordonNode(name string) (model.ActionResult, error) {
	s.mockMu.Lock()
	defer s.mockMu.Unlock()

	for i := range s.mockNodes {
		if s.mockNodes[i].Name != name {
			continue
		}
		roles := strings.Split(s.mockNodes[i].Roles, ",")
		trimmed := make([]string, 0, len(roles))
		for _, role := range roles {
			clean := strings.TrimSpace(role)
			if clean == "" || clean == "cordoned" {
				continue
			}
			trimmed = append(trimmed, clean)
		}
		if len(trimmed) == 0 {
			trimmed = []string{"worker"}
		}
		s.mockNodes[i].Roles = strings.Join(trimmed, ",")
		return model.ActionResult{Success: true, Message: fmt.Sprintf("Node %s uncordoned", name)}, nil
	}

	return model.ActionResult{}, ErrNotFound
}

func (s *Service) mockDrainNodePreview(name string) (model.NodeDrainPreview, error) {
	s.mockMu.RLock()
	defer s.mockMu.RUnlock()

	exists := false
	for _, node := range s.mockNodes {
		if node.Name == name {
			exists = true
			break
		}
	}
	if !exists {
		return model.NodeDrainPreview{}, ErrNotFound
	}

	evictable := make([]model.NodeDrainPod, 0, len(s.mockPods))
	skipped := make([]model.NodeDrainPod, 0)
	for _, pod := range s.mockPods {
		if strings.Contains(pod.Namespace, "kube-system") {
			skipped = append(skipped, model.NodeDrainPod{
				Namespace: pod.Namespace,
				Name:      pod.Name,
				Reason:    "system pod",
			})
			continue
		}
		evictable = append(evictable, model.NodeDrainPod{
			Namespace: pod.Namespace,
			Name:      pod.Name,
		})
	}

	blockers := []model.NodeDrainBlocker{}
	if strings.Contains(strings.ToLower(name), "master") {
		blockers = append(blockers, model.NodeDrainBlocker{
			Kind:      "pdb",
			Message:   "Control-plane pods are protected by disruption budget in mock mode.",
			Pod:       model.NodeDrainPod{Namespace: "kube-system", Name: "kube-apiserver"},
			Reference: "kube-system/control-plane-pdb",
		})
	}

	return model.NodeDrainPreview{
		Node:        name,
		Evictable:   evictable,
		Skipped:     skipped,
		Blockers:    blockers,
		SafeToDrain: len(blockers) == 0,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *Service) mockDrainNode(name string, force bool) (model.ActionResult, error) {
	preview, err := s.mockDrainNodePreview(name)
	if err != nil {
		return model.ActionResult{}, err
	}
	if len(preview.Blockers) > 0 && !force {
		return model.ActionResult{}, fmt.Errorf("drain blocked by %d safety checks; retry with force=true after review", len(preview.Blockers))
	}

	if _, err := s.mockCordonNode(name); err != nil {
		return model.ActionResult{}, err
	}

	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Node %s drained (%d pod evictions requested).", name, len(preview.Evictable)),
	}, nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
