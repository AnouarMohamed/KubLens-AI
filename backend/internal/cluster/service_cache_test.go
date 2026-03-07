package cluster

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"

	"kubelens-backend/internal/model"
)

func TestSnapshotFallsBackToStaleCacheWhenFetchFails(t *testing.T) {
	client := fake.NewSimpleClientset()
	client.PrependReactor("list", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("pods unavailable")
	})

	svc := &Service{
		client:     client,
		isReal:     true,
		apiTimeout: time.Second,
		cacheTTL:   time.Second,
		cache: cachedSlices{
			pods: []model.PodSummary{
				{Name: "stale-pod", Namespace: "default", Status: model.PodStatusRunning},
			},
			nodes: []model.NodeSummary{
				{Name: "stale-node", Status: model.NodeStatusReady},
			},
			expiresAt: time.Now().Add(-time.Minute),
		},
	}

	pods, nodes := svc.Snapshot(context.Background())
	if len(pods) != 1 || pods[0].Name != "stale-pod" {
		t.Fatalf("unexpected stale pods fallback: %+v", pods)
	}
	if len(nodes) != 1 || nodes[0].Name != "stale-node" {
		t.Fatalf("unexpected stale nodes fallback: %+v", nodes)
	}
}

func TestSnapshotDeduplicatesConcurrentFetches(t *testing.T) {
	client := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "default"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
		&corev1.Node{
			ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
			Status: corev1.NodeStatus{
				Conditions: []corev1.NodeCondition{{Type: corev1.NodeReady, Status: corev1.ConditionTrue}},
			},
		},
	)

	var podListCalls atomic.Int32
	var nodeListCalls atomic.Int32
	client.PrependReactor("list", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
		podListCalls.Add(1)
		return false, nil, nil
	})
	client.PrependReactor("list", "nodes", func(k8stesting.Action) (bool, runtime.Object, error) {
		nodeListCalls.Add(1)
		return false, nil, nil
	})

	svc := &Service{
		client:     client,
		isReal:     true,
		apiTimeout: 2 * time.Second,
		cacheTTL:   time.Minute,
	}

	const workers = 12
	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			pods, nodes := svc.Snapshot(context.Background())
			if len(pods) == 0 || len(nodes) == 0 {
				t.Error("expected pods and nodes from snapshot")
			}
		}()
	}
	wg.Wait()

	if podListCalls.Load() != 1 {
		t.Fatalf("pod list calls = %d, want 1", podListCalls.Load())
	}
	if nodeListCalls.Load() != 1 {
		t.Fatalf("node list calls = %d, want 1", nodeListCalls.Load())
	}
}

func TestListNamespacesFallsBackToStaleCacheWhenFetchFails(t *testing.T) {
	client := fake.NewSimpleClientset()
	client.PrependReactor("list", "namespaces", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("namespaces unavailable")
	})

	svc := &Service{
		client:     client,
		isReal:     true,
		apiTimeout: time.Second,
		cacheTTL:   time.Second,
		cache: cachedSlices{
			namespaces: []string{"default", "kube-system"},
			expiresAt:  time.Now().Add(-time.Minute),
		},
	}

	namespaces := svc.ListNamespaces(context.Background())
	if len(namespaces) != 2 || namespaces[0] != "default" || namespaces[1] != "kube-system" {
		t.Fatalf("unexpected namespaces fallback: %+v", namespaces)
	}
}
