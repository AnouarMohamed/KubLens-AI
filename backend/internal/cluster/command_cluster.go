package cluster

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8stypes "k8s.io/apimachinery/pkg/types"

	"kubelens-backend/internal/model"
)

func (s *Service) CreatePod(ctx context.Context, req model.PodCreateRequest) (model.ActionResult, error) {
	namespace := strings.TrimSpace(req.Namespace)
	if namespace == "" {
		namespace = "default"
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return model.ActionResult{}, fmt.Errorf("pod name is required")
	}

	image := strings.TrimSpace(req.Image)
	if image == "" {
		image = "nginx:latest"
	}

	if s.inMockMode() {
		return s.mockCreatePod(namespace, name, image)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
			Labels: map[string]string{
				"app.kubernetes.io/managed-by": "kubelens",
			},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:  "main",
					Image: image,
				},
			},
		},
	}

	if _, err := s.client.CoreV1().Pods(namespace).Create(callCtx, pod, metav1.CreateOptions{}); err != nil {
		return model.ActionResult{}, fmt.Errorf("create pod: %w", err)
	}
	s.invalidateCache()

	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Pod %s/%s created", namespace, name),
	}, nil
}

func (s *Service) RestartPod(ctx context.Context, namespace, name string) (model.ActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)
	if namespace == "" || name == "" {
		return model.ActionResult{}, errors.New("namespace and name are required")
	}

	if s.inMockMode() {
		return s.mockRestartPod(namespace, name)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	grace := int64(0)
	policy := metav1.DeletePropagationBackground
	if err := s.client.CoreV1().Pods(namespace).Delete(callCtx, name, metav1.DeleteOptions{
		GracePeriodSeconds: &grace,
		PropagationPolicy:  &policy,
	}); err != nil {
		if apierrors.IsNotFound(err) {
			return model.ActionResult{}, ErrNotFound
		}
		return model.ActionResult{}, fmt.Errorf("restart pod: %w", err)
	}
	s.invalidateCache()

	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Restart triggered for pod %s/%s", namespace, name),
	}, nil
}

func (s *Service) DeletePod(ctx context.Context, namespace, name string) (model.ActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)
	if namespace == "" || name == "" {
		return model.ActionResult{}, errors.New("namespace and name are required")
	}

	if s.inMockMode() {
		return s.mockDeletePod(namespace, name)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	if err := s.client.CoreV1().Pods(namespace).Delete(callCtx, name, metav1.DeleteOptions{}); err != nil {
		if apierrors.IsNotFound(err) {
			return model.ActionResult{}, ErrNotFound
		}
		return model.ActionResult{}, fmt.Errorf("delete pod: %w", err)
	}
	s.invalidateCache()

	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Pod %s/%s deleted", namespace, name),
	}, nil
}

func (s *Service) CordonNode(ctx context.Context, name string) (model.ActionResult, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return model.ActionResult{}, errors.New("node name is required")
	}

	if s.inMockMode() {
		return s.mockCordonNode(name)
	}

	if err := s.patchNodeSchedulable(ctx, name, true); err != nil {
		if apierrors.IsNotFound(err) {
			return model.ActionResult{}, ErrNotFound
		}
		return model.ActionResult{}, fmt.Errorf("cordon node: %w", err)
	}
	s.invalidateCache()

	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Node %s cordoned", name),
	}, nil
}

func (s *Service) UncordonNode(ctx context.Context, name string) (model.ActionResult, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return model.ActionResult{}, errors.New("node name is required")
	}

	if s.inMockMode() {
		return s.mockUncordonNode(name)
	}

	if err := s.patchNodeSchedulable(ctx, name, false); err != nil {
		if apierrors.IsNotFound(err) {
			return model.ActionResult{}, ErrNotFound
		}
		return model.ActionResult{}, fmt.Errorf("uncordon node: %w", err)
	}
	s.invalidateCache()

	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Node %s uncordoned", name),
	}, nil
}

func (s *Service) patchNodeSchedulable(ctx context.Context, name string, unschedulable bool) error {
	body, _ := json.Marshal(map[string]any{
		"spec": map[string]bool{
			"unschedulable": unschedulable,
		},
	})

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	_, err := s.client.CoreV1().Nodes().Patch(callCtx, name, k8stypes.MergePatchType, body, metav1.PatchOptions{})
	return err
}
