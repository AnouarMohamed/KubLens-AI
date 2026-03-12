package cluster

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"kubelens-backend/internal/model"
)

func (s *Service) listRealAppsResources(callCtx context.Context, kind string) ([]model.ResourceRecord, bool, error) {
	switch kind {
	case "deployments":
		list, err := s.client.AppsV1().Deployments("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, deployment := range list.Items {
			desired := int32(1)
			if deployment.Spec.Replicas != nil {
				desired = *deployment.Spec.Replicas
			}
			items = append(items, model.ResourceRecord{
				ID:        string(deployment.UID),
				Name:      deployment.Name,
				Namespace: deployment.Namespace,
				Status:    fmt.Sprintf("%d/%d Ready", deployment.Status.ReadyReplicas, desired),
				Age:       formatAge(deployment.CreationTimestamp.Time),
				Summary:   string(deployment.Spec.Strategy.Type),
			})
		}
		return items, true, nil
	case "replicasets":
		list, err := s.client.AppsV1().ReplicaSets("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, rs := range list.Items {
			desired := int32(0)
			if rs.Spec.Replicas != nil {
				desired = *rs.Spec.Replicas
			}
			items = append(items, model.ResourceRecord{
				ID:        string(rs.UID),
				Name:      rs.Name,
				Namespace: rs.Namespace,
				Status:    fmt.Sprintf("%d/%d Ready", rs.Status.ReadyReplicas, desired),
				Age:       formatAge(rs.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Observed generation %d", rs.Status.ObservedGeneration),
			})
		}
		return items, true, nil
	case "statefulsets":
		list, err := s.client.AppsV1().StatefulSets("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, st := range list.Items {
			replicas := int32(1)
			if st.Spec.Replicas != nil {
				replicas = *st.Spec.Replicas
			}
			items = append(items, model.ResourceRecord{
				ID:        string(st.UID),
				Name:      st.Name,
				Namespace: st.Namespace,
				Status:    fmt.Sprintf("%d/%d Ready", st.Status.ReadyReplicas, replicas),
				Age:       formatAge(st.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Service: %s", st.Spec.ServiceName),
			})
		}
		return items, true, nil
	case "daemonsets":
		list, err := s.client.AppsV1().DaemonSets("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, ds := range list.Items {
			items = append(items, model.ResourceRecord{
				ID:        string(ds.UID),
				Name:      ds.Name,
				Namespace: ds.Namespace,
				Status:    fmt.Sprintf("%d/%d Ready", ds.Status.NumberReady, ds.Status.DesiredNumberScheduled),
				Age:       formatAge(ds.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Updated %d", ds.Status.UpdatedNumberScheduled),
			})
		}
		return items, true, nil
	case "jobs":
		list, err := s.client.BatchV1().Jobs("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, job := range list.Items {
			success := job.Status.Succeeded
			failed := job.Status.Failed
			status := "Running"
			if failed > 0 {
				status = fmt.Sprintf("Failed (%d)", failed)
			} else if success > 0 {
				status = fmt.Sprintf("Succeeded (%d)", success)
			}
			items = append(items, model.ResourceRecord{
				ID:        string(job.UID),
				Name:      job.Name,
				Namespace: job.Namespace,
				Status:    status,
				Age:       formatAge(job.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Completions: %d", success),
			})
		}
		return items, true, nil
	case "cronjobs":
		list, err := s.client.BatchV1().CronJobs("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, cron := range list.Items {
			suspended := "Active"
			if cron.Spec.Suspend != nil && *cron.Spec.Suspend {
				suspended = "Suspended"
			}
			items = append(items, model.ResourceRecord{
				ID:        string(cron.UID),
				Name:      cron.Name,
				Namespace: cron.Namespace,
				Status:    suspended,
				Age:       formatAge(cron.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Schedule: %s", cron.Spec.Schedule),
			})
		}
		return items, true, nil
	default:
		return nil, false, nil
	}
}
