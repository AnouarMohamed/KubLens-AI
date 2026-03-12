package cluster

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"kubelens-backend/internal/model"
)

func (s *Service) listRealNetworkingResources(callCtx context.Context, kind string) ([]model.ResourceRecord, bool, error) {
	switch kind {
	case "services":
		list, err := s.client.CoreV1().Services("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
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
		return items, true, nil
	case "ingresses":
		list, err := s.client.NetworkingV1().Ingresses("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
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
		return items, true, nil
	case "networkpolicies":
		list, err := s.client.NetworkingV1().NetworkPolicies("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
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
		return items, true, nil
	case "configmaps":
		list, err := s.client.CoreV1().ConfigMaps("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
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
		return items, true, nil
	case "secrets":
		list, err := s.client.CoreV1().Secrets("").List(callCtx, metav1.ListOptions{})
		if err != nil {
			return nil, true, err
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
		return items, true, nil
	default:
		return nil, false, nil
	}
}
