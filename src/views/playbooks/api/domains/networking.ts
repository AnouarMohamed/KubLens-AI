import type { Playbook } from "../../types";

export const NETWORKING_PLAYBOOKS: Playbook[] = [
  {
    id: "ingress-5xx",
    title: "Ingress 5xx Triage",
    whenToUse: "External traffic sees 502, 503, or 504 via ingress.",
    primaryGoal: "Determine whether failure is ingress routing, service endpoints, or backend health.",
    commands: [
      "kubectl get ingress -A",
      "kubectl describe ingress <name> -n <namespace>",
      "kubectl get svc,endpoints -n <namespace>",
      "kubectl logs <ingress-controller-pod> -n <controller-namespace> --tail=200",
    ],
    steps: [
      "Confirm host and path route to intended backend service.",
      "Check service endpoints for ready targets.",
      "Inspect ingress controller logs for upstream timeout or TLS errors.",
      "Fix route, backend readiness, or timeout configuration.",
    ],
    verify: [
      "HTTP 5xx rate drops to baseline.",
      "Ingress controller logs show successful upstream responses.",
      "Synthetic check passes for affected routes.",
    ],
  },
  {
    id: "service-endpoints-empty",
    title: "Service With Empty Endpoints",
    whenToUse: "Service exists but has zero endpoints.",
    primaryGoal: "Reconnect service selectors to ready pods quickly.",
    commands: [
      "kubectl get svc <service> -n <namespace> -o yaml",
      "kubectl get endpoints <service> -n <namespace> -o yaml",
      "kubectl get pods -n <namespace> --show-labels",
      "kubectl get deploy -n <namespace> -o yaml",
    ],
    steps: [
      "Compare service selector labels with pod labels.",
      "Fix selector mismatch or deployment labels.",
      "Ensure targeted pods are Ready and not failing probes.",
      "Re-test service connectivity after endpoints repopulate.",
    ],
    verify: [
      "Endpoints object has expected pod addresses.",
      "Service traffic succeeds from in-cluster client.",
      "No repeated no endpoints available warnings.",
    ],
  },
  {
    id: "dns-outage",
    title: "CoreDNS Outage Response",
    whenToUse: "Cluster services fail name resolution across namespaces.",
    primaryGoal: "Restore DNS reliability and unblock dependent workloads.",
    commands: [
      "kubectl get pods -n kube-system -l k8s-app=kube-dns",
      "kubectl logs -n kube-system deploy/coredns --tail=200",
      "kubectl get svc -n kube-system kube-dns -o wide",
      "kubectl exec -n <namespace> <pod> -- nslookup kubernetes.default.svc.cluster.local",
    ],
    steps: [
      "Check CoreDNS pod health and restart behavior.",
      "Validate kube-dns service endpoints and cluster IP.",
      "Roll restart CoreDNS deployment if config is healthy but pods stale.",
      "Confirm app namespaces can resolve internal service names.",
    ],
    verify: [
      "DNS queries resolve successfully from representative pods.",
      "CoreDNS restart count stabilizes.",
      "Application timeout incidents tied to DNS stop increasing.",
    ],
  },
  {
    id: "dns-latency",
    title: "High DNS Latency Mitigation",
    whenToUse: "Requests succeed but with elevated DNS resolution latency.",
    primaryGoal: "Reduce lookup latency that inflates end-to-end request times.",
    commands: [
      "kubectl top pod -n kube-system -l k8s-app=kube-dns",
      "kubectl get configmap coredns -n kube-system -o yaml",
      "kubectl get endpoints -n kube-system kube-dns",
      "kubectl exec -n <namespace> <pod> -- time nslookup <service>.<namespace>.svc.cluster.local",
    ],
    steps: [
      "Check CoreDNS CPU saturation and throttling.",
      "Inspect CoreDNS configuration for expensive upstream behavior.",
      "Scale CoreDNS replicas if load exceeds capacity.",
      "Validate pod DNS policies and search domain usage.",
    ],
    verify: [
      "Median DNS lookup time returns within SLO.",
      "CoreDNS CPU throttling drops significantly.",
      "Application p95 latency follows DNS improvement trend.",
    ],
  },
  {
    id: "networkpolicy-lockout",
    title: "NetworkPolicy Lockout",
    whenToUse: "Traffic between services suddenly drops after policy changes.",
    primaryGoal: "Reopen required paths safely while preserving intended isolation.",
    commands: [
      "kubectl get networkpolicy -A",
      "kubectl describe networkpolicy <name> -n <namespace>",
      "kubectl exec -n <namespace> <pod> -- curl -sv http://<service>.<namespace>.svc.cluster.local:<port>",
      "kubectl get pods -n <namespace> --show-labels",
    ],
    steps: [
      "Identify source and destination labels impacted.",
      "Temporarily broaden policy with explicit time-bound exception.",
      "Test east-west path in-cluster before and after patch.",
      "Reduce exception to minimal required rules.",
    ],
    verify: [
      "Required service-to-service paths recover.",
      "No unintended namespace-wide allow rules remain.",
      "Policy set is documented with owner and expiry notes.",
    ],
  },
];
