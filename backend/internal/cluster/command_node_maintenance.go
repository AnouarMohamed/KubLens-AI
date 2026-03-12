package cluster

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	policyv1 "k8s.io/api/policy/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"

	"kubelens-backend/internal/model"
)

func (s *Service) DrainNodePreview(ctx context.Context, name string) (model.NodeDrainPreview, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return model.NodeDrainPreview{}, errors.New("node name is required")
	}

	if s.inMockMode() {
		return s.mockDrainNodePreview(name)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	if _, err := s.client.CoreV1().Nodes().Get(callCtx, name, metav1.GetOptions{}); err != nil {
		if apierrors.IsNotFound(err) {
			return model.NodeDrainPreview{}, ErrNotFound
		}
		return model.NodeDrainPreview{}, fmt.Errorf("read node: %w", err)
	}

	pods, err := s.client.CoreV1().Pods("").List(callCtx, metav1.ListOptions{
		FieldSelector: "spec.nodeName=" + name,
	})
	if err != nil {
		return model.NodeDrainPreview{}, fmt.Errorf("list node pods: %w", err)
	}

	pdbs, err := s.client.PolicyV1().PodDisruptionBudgets("").List(callCtx, metav1.ListOptions{})
	if err != nil {
		return model.NodeDrainPreview{}, fmt.Errorf("list pod disruption budgets: %w", err)
	}

	byNamespace := make(map[string][]policyv1.PodDisruptionBudget)
	for _, pdb := range pdbs.Items {
		byNamespace[pdb.Namespace] = append(byNamespace[pdb.Namespace], pdb)
	}

	evictable := make([]model.NodeDrainPod, 0, len(pods.Items))
	skipped := make([]model.NodeDrainPod, 0, len(pods.Items))
	blockers := make([]model.NodeDrainBlocker, 0)

	for _, pod := range pods.Items {
		podRef := model.NodeDrainPod{
			Namespace: pod.Namespace,
			Name:      pod.Name,
		}

		switch {
		case isMirrorPod(pod):
			podRef.Reason = "static mirror pod"
			skipped = append(skipped, podRef)
			continue
		case ownedByDaemonSet(pod):
			podRef.Reason = "managed by DaemonSet"
			skipped = append(skipped, podRef)
			continue
		case completedPod(pod):
			podRef.Reason = "completed pod"
			skipped = append(skipped, podRef)
			continue
		}

		if hasLocalStorage(pod) {
			blockers = append(blockers, model.NodeDrainBlocker{
				Kind:    "local-storage",
				Message: "Pod uses local storage (emptyDir/hostPath); eviction can cause data loss.",
				Pod: model.NodeDrainPod{
					Namespace: pod.Namespace,
					Name:      pod.Name,
				},
			})
		}

		for _, pdb := range byNamespace[pod.Namespace] {
			if !pdbMatchesPod(pdb, pod.Labels) {
				continue
			}
			if pdb.Status.DisruptionsAllowed > 0 {
				continue
			}
			blockers = append(blockers, model.NodeDrainBlocker{
				Kind:    "pdb",
				Message: "PodDisruptionBudget does not currently allow disruptions.",
				Pod: model.NodeDrainPod{
					Namespace: pod.Namespace,
					Name:      pod.Name,
				},
				Reference: fmt.Sprintf("%s/%s", pdb.Namespace, pdb.Name),
			})
		}

		evictable = append(evictable, podRef)
	}

	sort.SliceStable(evictable, func(i, j int) bool {
		if evictable[i].Namespace == evictable[j].Namespace {
			return evictable[i].Name < evictable[j].Name
		}
		return evictable[i].Namespace < evictable[j].Namespace
	})
	sort.SliceStable(skipped, func(i, j int) bool {
		if skipped[i].Namespace == skipped[j].Namespace {
			return skipped[i].Name < skipped[j].Name
		}
		return skipped[i].Namespace < skipped[j].Namespace
	})
	sort.SliceStable(blockers, func(i, j int) bool {
		if blockers[i].Pod.Namespace == blockers[j].Pod.Namespace {
			return blockers[i].Pod.Name < blockers[j].Pod.Name
		}
		return blockers[i].Pod.Namespace < blockers[j].Pod.Namespace
	})

	return model.NodeDrainPreview{
		Node:        name,
		Evictable:   evictable,
		Skipped:     skipped,
		Blockers:    blockers,
		SafeToDrain: len(blockers) == 0,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *Service) DrainNode(ctx context.Context, name string, force bool) (model.ActionResult, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return model.ActionResult{}, errors.New("node name is required")
	}

	if s.inMockMode() {
		return s.mockDrainNode(name, force)
	}

	preview, err := s.DrainNodePreview(ctx, name)
	if err != nil {
		return model.ActionResult{}, err
	}
	if len(preview.Blockers) > 0 && !force {
		return model.ActionResult{}, fmt.Errorf("drain blocked by %d safety checks; retry with force=true after review", len(preview.Blockers))
	}

	if err := s.patchNodeSchedulable(ctx, name, true); err != nil {
		if apierrors.IsNotFound(err) {
			return model.ActionResult{}, ErrNotFound
		}
		return model.ActionResult{}, fmt.Errorf("cordon before drain: %w", err)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	failed := make([]string, 0)
	evictedCount := 0
	for _, pod := range preview.Evictable {
		eviction := &policyv1.Eviction{
			ObjectMeta: metav1.ObjectMeta{
				Namespace: pod.Namespace,
				Name:      pod.Name,
			},
		}
		err := s.client.CoreV1().Pods(pod.Namespace).EvictV1(callCtx, eviction)
		if err == nil {
			evictedCount++
			continue
		}
		if apierrors.IsNotFound(err) {
			continue
		}
		failed = append(failed, fmt.Sprintf("%s/%s (%s)", pod.Namespace, pod.Name, err.Error()))
	}
	if len(failed) > 0 {
		return model.ActionResult{}, fmt.Errorf("drain failed for %d pod(s): %s", len(failed), strings.Join(failed, "; "))
	}

	s.invalidateCache()
	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Node %s drained (%d pod evictions requested).", name, evictedCount),
	}, nil
}

func isMirrorPod(pod corev1.Pod) bool {
	if pod.Annotations == nil {
		return false
	}
	_, ok := pod.Annotations[corev1.MirrorPodAnnotationKey]
	return ok
}

func ownedByDaemonSet(pod corev1.Pod) bool {
	for _, ref := range pod.OwnerReferences {
		if strings.EqualFold(ref.Kind, "DaemonSet") {
			return true
		}
	}
	return false
}

func completedPod(pod corev1.Pod) bool {
	return pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed
}

func hasLocalStorage(pod corev1.Pod) bool {
	for _, volume := range pod.Spec.Volumes {
		if volume.EmptyDir != nil || volume.HostPath != nil {
			return true
		}
	}
	return false
}

func pdbMatchesPod(pdb policyv1.PodDisruptionBudget, labelsMap map[string]string) bool {
	if pdb.Spec.Selector == nil {
		return false
	}
	selector, err := metav1.LabelSelectorAsSelector(pdb.Spec.Selector)
	if err != nil {
		return false
	}
	if selector.Empty() {
		return false
	}
	return selector.Matches(labels.Set(labelsMap))
}
