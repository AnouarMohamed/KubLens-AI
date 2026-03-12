package cluster

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"kubelens-backend/internal/model"
)

func (s *Service) listRealStorageRBACResources(callCtx context.Context, kind string) ([]model.ResourceRecord, bool, error) {
	switch kind {
	case "persistentvolumes":
		list, err := s.client.CoreV1().PersistentVolumes().List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
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
		return items, true, nil
	case "persistentvolumeclaims":
		list, err := s.client.CoreV1().PersistentVolumeClaims("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
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
		return items, true, nil
	case "storageclasses":
		list, err := s.client.StorageV1().StorageClasses().List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
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
		return items, true, nil
	case "namespaces":
		list, err := s.client.CoreV1().Namespaces().List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
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
		return items, true, nil
	case "serviceaccounts":
		list, err := s.client.CoreV1().ServiceAccounts("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
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
		return items, true, nil
	case "rbac":
		roles, err := s.client.RbacV1().Roles("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
		}
		roleBindings, err := s.client.RbacV1().RoleBindings("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
		}
		clusterRoles, err := s.client.RbacV1().ClusterRoles().List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
		}
		clusterRoleBindings, err := s.client.RbacV1().ClusterRoleBindings().List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
		}

		items := make([]model.ResourceRecord, 0, len(roles.Items)+len(roleBindings.Items)+len(clusterRoles.Items)+len(clusterRoleBindings.Items))
		for _, role := range roles.Items {
			items = append(items, model.ResourceRecord{
				ID:        string(role.UID),
				Name:      role.Name,
				Namespace: role.Namespace,
				Status:    "Role",
				Age:       formatAge(role.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Rules: %d", len(role.Rules)),
			})
		}
		for _, binding := range roleBindings.Items {
			items = append(items, model.ResourceRecord{
				ID:        string(binding.UID),
				Name:      binding.Name,
				Namespace: binding.Namespace,
				Status:    "RoleBinding",
				Age:       formatAge(binding.CreationTimestamp.Time),
				Summary:   fmt.Sprintf("Subjects: %d", len(binding.Subjects)),
			})
		}
		for _, role := range clusterRoles.Items {
			items = append(items, model.ResourceRecord{
				ID:      string(role.UID),
				Name:    role.Name,
				Status:  "ClusterRole",
				Age:     formatAge(role.CreationTimestamp.Time),
				Summary: fmt.Sprintf("Rules: %d", len(role.Rules)),
			})
		}
		for _, binding := range clusterRoleBindings.Items {
			items = append(items, model.ResourceRecord{
				ID:      string(binding.UID),
				Name:    binding.Name,
				Status:  "ClusterRoleBinding",
				Age:     formatAge(binding.CreationTimestamp.Time),
				Summary: fmt.Sprintf("Subjects: %d", len(binding.Subjects)),
			})
		}
		return items, true, nil
	default:
		return nil, false, nil
	}
}
