package cluster

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"kubelens-backend/internal/model"
)

func (s *Service) listRealResources(ctx context.Context, kind string) ([]model.ResourceRecord, error) {
	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "pods":
		pods, _ := s.Snapshot(ctx)
		items := make([]model.ResourceRecord, 0, len(pods))
		for _, pod := range pods {
			items = append(items, model.ResourceRecord{
				ID:        pod.ID,
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Status:    string(pod.Status),
				Age:       pod.Age,
				Summary:   fmt.Sprintf("CPU %s, Memory %s, Restarts %d", pod.CPU, pod.Memory, pod.Restarts),
			})
		}
		return items, nil
	case "deployments":
		list, err := s.client.AppsV1().Deployments("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
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
		return items, nil
	case "replicasets":
		list, err := s.client.AppsV1().ReplicaSets("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
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
		return items, nil
	case "statefulsets":
		list, err := s.client.AppsV1().StatefulSets("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
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
		return items, nil
	case "daemonsets":
		list, err := s.client.AppsV1().DaemonSets("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
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
		return items, nil
	case "jobs":
		list, err := s.client.BatchV1().Jobs("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
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
		return items, nil
	case "cronjobs":
		list, err := s.client.BatchV1().CronJobs("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
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
		return items, nil
	case "services":
		list, err := s.client.CoreV1().Services("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, service := range list.Items {
			ports := make([]string, 0, len(service.Spec.Ports))
			for _, port := range service.Spec.Ports {
				ports = append(ports, strconv.Itoa(int(port.Port)))
			}
			items = append(items, model.ResourceRecord{
				ID:        string(service.UID),
				Name:      service.Name,
				Namespace: service.Namespace,
				Status:    string(service.Spec.Type),
				Age:       formatAge(service.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("ClusterIP %s, Ports %s", service.Spec.ClusterIP, strings.Join(ports, ",")),
			})
		}
		return items, nil
	case "ingresses":
		list, err := s.client.NetworkingV1().Ingresses("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, ing := range list.Items {
			hosts := make([]string, 0, len(ing.Spec.Rules))
			for _, rule := range ing.Spec.Rules {
				if strings.TrimSpace(rule.Host) != "" {
					hosts = append(hosts, rule.Host)
				}
			}
			status := "No address"
			if len(ing.Status.LoadBalancer.Ingress) > 0 {
				status = "Address assigned"
			}
			items = append(items, model.ResourceRecord{
				ID:        string(ing.UID),
				Name:      ing.Name,
				Namespace: ing.Namespace,
				Status:    status,
				Age:       formatAge(ing.CreationTimestamp.Time),
				Summary:   strings.Join(hosts, ", "),
			})
		}
		return items, nil
	case "networkpolicies":
		list, err := s.client.NetworkingV1().NetworkPolicies("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, policy := range list.Items {
			items = append(items, model.ResourceRecord{
				ID:        string(policy.UID),
				Name:      policy.Name,
				Namespace: policy.Namespace,
				Status:    "Active",
				Age:       formatAge(policy.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Ingress rules %d, Egress rules %d", len(policy.Spec.Ingress), len(policy.Spec.Egress)),
			})
		}
		return items, nil
	case "configmaps":
		list, err := s.client.CoreV1().ConfigMaps("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, configMap := range list.Items {
			items = append(items, model.ResourceRecord{
				ID:        string(configMap.UID),
				Name:      configMap.Name,
				Namespace: configMap.Namespace,
				Status:    "Active",
				Age:       formatAge(configMap.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Keys: %d", len(configMap.Data)),
			})
		}
		return items, nil
	case "secrets":
		list, err := s.client.CoreV1().Secrets("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, secret := range list.Items {
			items = append(items, model.ResourceRecord{
				ID:        string(secret.UID),
				Name:      secret.Name,
				Namespace: secret.Namespace,
				Status:    "Active",
				Age:       formatAge(secret.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Type: %s, Keys: %d", secret.Type, len(secret.Data)),
			})
		}
		return items, nil
	case "persistentvolumes":
		list, err := s.client.CoreV1().PersistentVolumes().List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, pv := range list.Items {
			capacity := quantityToString(pv.Spec.Capacity.Storage())
			items = append(items, model.ResourceRecord{
				ID:      string(pv.UID),
				Name:    pv.Name,
				Status:  string(pv.Status.Phase),
				Age:     formatAge(pv.CreationTimestamp.Time),
				Summary: fmt.Sprintf("Capacity: %s", capacity),
			})
		}
		return items, nil
	case "persistentvolumeclaims":
		list, err := s.client.CoreV1().PersistentVolumeClaims("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, pvc := range list.Items {
			requested := quantityToString(pvc.Spec.Resources.Requests.Storage())
			items = append(items, model.ResourceRecord{
				ID:        string(pvc.UID),
				Name:      pvc.Name,
				Namespace: pvc.Namespace,
				Status:    string(pvc.Status.Phase),
				Age:       formatAge(pvc.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Storage: %s", requested),
			})
		}
		return items, nil
	case "storageclasses":
		list, err := s.client.StorageV1().StorageClasses().List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, sc := range list.Items {
			defaultClass := "No"
			if sc.Annotations["storageclass.kubernetes.io/is-default-class"] == "true" {
				defaultClass = "Default"
			}
			items = append(items, model.ResourceRecord{
				ID:      string(sc.UID),
				Name:    sc.Name,
				Status:  defaultClass,
				Age:     formatAge(sc.CreationTimestamp.Time),
				Summary: sc.Provisioner,
			})
		}
		return items, nil
	case "nodes":
		_, nodes := s.Snapshot(ctx)
		items := make([]model.ResourceRecord, 0, len(nodes))
		for _, node := range nodes {
			items = append(items, model.ResourceRecord{
				ID:      node.Name,
				Name:    node.Name,
				Status:  string(node.Status),
				Age:     node.Age,
				Summary: fmt.Sprintf("CPU %s, Memory %s", node.CPUUsage, node.MemUsage),
			})
		}
		return items, nil
	case "namespaces":
		list, err := s.client.CoreV1().Namespaces().List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, ns := range list.Items {
			items = append(items, model.ResourceRecord{
				ID:      string(ns.UID),
				Name:    ns.Name,
				Status:  string(ns.Status.Phase),
				Age:     formatAge(ns.CreationTimestamp.Time),
				Summary: "Namespace",
			})
		}
		return items, nil
	case "events":
		events := s.ListClusterEvents(ctx)
		items := make([]model.ResourceRecord, 0, len(events))
		for i, event := range events {
			items = append(items, model.ResourceRecord{
				ID:      fmt.Sprintf("event-%d", i),
				Name:    event.Reason,
				Status:  event.Type,
				Age:     event.Age,
				Summary: event.Message,
			})
		}
		return items, nil
	case "serviceaccounts":
		list, err := s.client.CoreV1().ServiceAccounts("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		items := make([]model.ResourceRecord, 0, len(list.Items))
		for _, sa := range list.Items {
			items = append(items, model.ResourceRecord{
				ID:        string(sa.UID),
				Name:      sa.Name,
				Namespace: sa.Namespace,
				Status:    "Active",
				Age:       formatAge(sa.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Secrets: %d", len(sa.Secrets)),
			})
		}
		return items, nil
	case "rbac":
		roles, err := s.client.RbacV1().Roles("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		roleBindings, err := s.client.RbacV1().RoleBindings("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		clusterRoles, err := s.client.RbacV1().ClusterRoles().List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		clusterRoleBindings, err := s.client.RbacV1().ClusterRoleBindings().List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}

		items := make([]model.ResourceRecord, 0, len(roles.Items)+len(roleBindings.Items)+len(clusterRoles.Items)+len(clusterRoleBindings.Items))
		for _, role := range roles.Items {
			items = append(items, model.ResourceRecord{ID: string(role.UID), Name: role.Name, Namespace: role.Namespace, Status: "Role", Age: formatAge(role.CreationTimestamp.Time), Summary: fmt.Sprintf("Rules: %d", len(role.Rules))})
		}
		for _, binding := range roleBindings.Items {
			items = append(items, model.ResourceRecord{ID: string(binding.UID), Name: binding.Name, Namespace: binding.Namespace, Status: "RoleBinding", Age: formatAge(binding.CreationTimestamp.Time), Summary: fmt.Sprintf("Subjects: %d", len(binding.Subjects))})
		}
		for _, role := range clusterRoles.Items {
			items = append(items, model.ResourceRecord{ID: string(role.UID), Name: role.Name, Status: "ClusterRole", Age: formatAge(role.CreationTimestamp.Time), Summary: fmt.Sprintf("Rules: %d", len(role.Rules))})
		}
		for _, binding := range clusterRoleBindings.Items {
			items = append(items, model.ResourceRecord{ID: string(binding.UID), Name: binding.Name, Status: "ClusterRoleBinding", Age: formatAge(binding.CreationTimestamp.Time), Summary: fmt.Sprintf("Subjects: %d", len(binding.Subjects))})
		}
		return items, nil
	case "metrics":
		pods, nodes := s.Snapshot(ctx)
		items := make([]model.ResourceRecord, 0, len(nodes)+len(pods))
		for _, node := range nodes {
			items = append(items, model.ResourceRecord{
				ID:      "node-" + node.Name,
				Name:    node.Name,
				Status:  "Node",
				Age:     node.Age,
				Summary: fmt.Sprintf("CPU %s, Memory %s", node.CPUUsage, node.MemUsage),
			})
		}
		for _, pod := range pods {
			items = append(items, model.ResourceRecord{
				ID:        "pod-" + pod.ID,
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Status:    "Pod",
				Age:       pod.Age,
				Summary:   fmt.Sprintf("CPU %s, Memory %s", pod.CPU, pod.Memory),
			})
		}
		return items, nil
	default:
		return nil, fmt.Errorf("unsupported resource kind: %s", kind)
	}
}

func (s *Service) listMockResources(kind string) []model.ResourceRecord {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind == "events" {
		events := s.mockClusterEvents()
		items := make([]model.ResourceRecord, 0, len(events))
		for i, event := range events {
			items = append(items, model.ResourceRecord{
				ID:      fmt.Sprintf("event-%d", i),
				Name:    event.Reason,
				Status:  event.Type,
				Age:     event.Age,
				Summary: event.Message,
			})
		}
		return items
	}

	pods, nodes := s.mockSnapshot()
	namespaces := s.mockNamespaceList()

	switch kind {
	case "pods":
		items := make([]model.ResourceRecord, 0, len(pods))
		for _, pod := range pods {
			items = append(items, model.ResourceRecord{
				ID:        pod.ID,
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Status:    string(pod.Status),
				Age:       pod.Age,
				Summary:   fmt.Sprintf("CPU %s, Memory %s", pod.CPU, pod.Memory),
			})
		}
		return items
	case "nodes":
		items := make([]model.ResourceRecord, 0, len(nodes))
		for _, node := range nodes {
			items = append(items, model.ResourceRecord{
				ID:      node.Name,
				Name:    node.Name,
				Status:  string(node.Status),
				Age:     node.Age,
				Summary: fmt.Sprintf("CPU %s, Memory %s", node.CPUUsage, node.MemUsage),
			})
		}
		return items
	case "namespaces":
		items := make([]model.ResourceRecord, 0, len(namespaces))
		for _, namespace := range namespaces {
			items = append(items, model.ResourceRecord{ID: namespace, Name: namespace, Status: "Active", Age: "30d", Summary: "Namespace"})
		}
		return items
	case "metrics":
		items := make([]model.ResourceRecord, 0, len(nodes)+len(pods))
		for _, node := range nodes {
			items = append(items, model.ResourceRecord{ID: "node-" + node.Name, Name: node.Name, Status: "Node", Age: node.Age, Summary: fmt.Sprintf("CPU %s, Memory %s", node.CPUUsage, node.MemUsage)})
		}
		for _, pod := range pods {
			items = append(items, model.ResourceRecord{ID: "pod-" + pod.ID, Name: pod.Name, Namespace: pod.Namespace, Status: "Pod", Age: pod.Age, Summary: fmt.Sprintf("CPU %s, Memory %s", pod.CPU, pod.Memory)})
		}
		return items
	default:
		return s.mockWorkloadResources(kind)
	}
}

func quantityToString(value *resource.Quantity) string {
	if value == nil {
		return "N/A"
	}
	return value.String()
}
