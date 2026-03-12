package rag

func defaultSources() []SourceDoc {
	return []SourceDoc{
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Pod lifecycle",
			URL:      "https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/",
			Fallback: "Pod phases include Pending, Running, Succeeded, Failed and Unknown. Pending often means scheduling or image pull issues. Failed means containers terminated and will not restart depending on restart policy.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Services",
			URL:      "https://kubernetes.io/docs/concepts/services-networking/service/",
			Fallback: "Services provide stable virtual IPs and DNS names for pod backends. Troubleshoot selectors, endpoints, and target ports when connectivity fails.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Ingress",
			URL:      "https://kubernetes.io/docs/concepts/services-networking/ingress/",
			Fallback: "Ingress routes HTTP/S traffic to services. Validate ingress class, host/path rules, TLS secrets, and controller health.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes NetworkPolicy",
			URL:      "https://kubernetes.io/docs/concepts/services-networking/network-policies/",
			Fallback: "NetworkPolicy controls pod ingress and egress. Deny-by-default behavior can block service communication if allow rules are incomplete.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes DNS",
			URL:      "https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/",
			Fallback: "Kubernetes DNS resolves service and pod names. Check CoreDNS health and namespace-qualified names when resolution fails.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Deployments",
			URL:      "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/",
			Fallback: "Deployments manage rollout and rollback of ReplicaSets. Analyze unavailable replicas, rollout status, and revision history for failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes StatefulSets",
			URL:      "https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/",
			Fallback: "StatefulSets provide stable identity and ordered rollout for stateful workloads. Storage, ordinals, and update strategy often drive failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes DaemonSets",
			URL:      "https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/",
			Fallback: "DaemonSets schedule one pod per node by selector. Taints, selectors, and node readiness determine daemon pod coverage.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Jobs",
			URL:      "https://kubernetes.io/docs/concepts/workloads/controllers/job/",
			Fallback: "Jobs run finite workloads to completion. Backoff limits, pod failures, and parallelism settings affect completion behavior.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes HPA",
			URL:      "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/",
			Fallback: "HPA scales workloads from metrics. Missing metrics, incorrect target values, or unavailable metrics-server cause scaling issues.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Node Affinity",
			URL:      "https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/",
			Fallback: "Node affinity and selectors constrain pod placement. Unsatisfiable constraints produce Pending pods with scheduling failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Taints and Tolerations",
			URL:      "https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/",
			Fallback: "Taints repel pods without matching tolerations. Scheduling and eviction issues can stem from taints not accounted for in workload specs.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Resource Quotas",
			URL:      "https://kubernetes.io/docs/concepts/policy/resource-quotas/",
			Fallback: "ResourceQuotas cap namespace resource usage. Pod creation or scaling can fail when quotas are reached.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Pod Priority",
			URL:      "https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/",
			Fallback: "Priority classes influence scheduling and preemption. Lower-priority pods may be evicted when higher-priority workloads arrive.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Persistent Volumes",
			URL:      "https://kubernetes.io/docs/concepts/storage/persistent-volumes/",
			Fallback: "PersistentVolumes and claims back stateful storage. Binding, access modes, and storage class mismatches are common causes of mount failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes ConfigMaps",
			URL:      "https://kubernetes.io/docs/concepts/configuration/configmap/",
			Fallback: "ConfigMaps inject non-secret config into pods. Invalid keys or stale mounts can break startup configuration.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Secrets",
			URL:      "https://kubernetes.io/docs/concepts/configuration/secret/",
			Fallback: "Secrets store sensitive data for workloads. Missing secrets or key mismatches commonly cause startup and auth failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes RBAC",
			URL:      "https://kubernetes.io/docs/reference/access-authn-authz/rbac/",
			Fallback: "RBAC roles and bindings control API access. Forbidden errors indicate missing permissions or wrong service accounts.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Security Contexts",
			URL:      "https://kubernetes.io/docs/tasks/configure-pod-container/security-context/",
			Fallback: "SecurityContext configures UID/GID, capabilities, and file permissions. Misconfiguration can block process startup or volume access.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Service Accounts",
			URL:      "https://kubernetes.io/docs/concepts/security/service-accounts/",
			Fallback: "Service accounts provide pod identity for API access. Missing bindings can cause in-cluster auth and permission failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Troubleshoot Clusters",
			URL:      "https://kubernetes.io/docs/tasks/debug/debug-cluster/",
			Fallback: "Cluster troubleshooting starts with node status, component health, and warning events. Verify control plane and networking first.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Troubleshoot Applications",
			URL:      "https://kubernetes.io/docs/tasks/debug/debug-application/",
			Fallback: "Application troubleshooting focuses on events, logs, probes, and configuration drift across pods and deployments.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes CrashLoopBackOff",
			URL:      "https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/",
			Fallback: "CrashLoopBackOff means repeated container crashes. Inspect termination reason, startup command, env, and dependencies.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes OOMKilled",
			URL:      "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/",
			Fallback: "OOMKilled indicates container memory exceeded limit. Adjust limits/requests and investigate memory growth or leaks.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes ImagePullBackOff",
			URL:      "https://kubernetes.io/docs/concepts/containers/images/",
			Fallback: "ImagePullBackOff typically means auth issues, wrong image name/tag, registry outages, or network restrictions.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Node Pressure",
			URL:      "https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/",
			Fallback: "Node pressure triggers evictions for memory, disk, or PID shortages. Check eviction signals and kubelet thresholds.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Node Problem Detector",
			URL:      "https://kubernetes.io/docs/tasks/debug/debug-cluster/monitor-node-health/",
			Fallback: "Node Problem Detector surfaces kernel and system-level node faults that impact scheduling and workload stability.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Probes",
			URL:      "https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/",
			Fallback: "Probe misconfiguration causes false restarts and traffic drops. Validate probe path, port, timing, and thresholds.",
		},
	}
}
