import type { Playbook } from "../../types";

export const NODE_PLAYBOOKS: Playbook[] = [
  {
    id: "node-pressure",
    title: "Node Pressure Recovery",
    whenToUse: "Node shows MemoryPressure, DiskPressure, or repeated NotReady transitions.",
    primaryGoal: "Stabilize scheduling and reduce noisy evictions before workloads are impacted cluster-wide.",
    commands: [
      "kubectl describe node <node>",
      "kubectl top node <node>",
      "kubectl get pods -A --field-selector spec.nodeName=<node>",
      "kubectl drain <node> --ignore-daemonsets --delete-emptydir-data --dry-run=server",
    ],
    steps: [
      "Cordon the node to stop new workload placement.",
      "Preview drain blockers (PDBs/system pods) and decide whether maintenance can proceed safely.",
      "Drain non-system workloads and verify critical services reschedule cleanly.",
      "Escalate to force drain only with explicit reason and change approval.",
    ],
    verify: [
      "Node conditions return to healthy (no pressure conditions).",
      "Evicted pods are Running on alternate nodes.",
      "No repeated Warning events tied to the drained node after 10 minutes.",
    ],
  },
  {
    id: "node-notready",
    title: "Node NotReady Isolation",
    whenToUse: "A node flips to NotReady and workloads start timing out.",
    primaryGoal: "Isolate impact and restore scheduler confidence before broad cluster degradation.",
    commands: [
      "kubectl get nodes -o wide",
      "kubectl describe node <node>",
      "kubectl get events -A --field-selector involvedObject.kind=Node,involvedObject.name=<node>",
      "kubectl get pods -A --field-selector spec.nodeName=<node>",
    ],
    steps: [
      "Cordon the affected node immediately.",
      "Check node events for kubelet, network, or container runtime failures.",
      "Drain workload pods if the node does not recover quickly.",
      "After root cause is fixed, uncordon and monitor for stable readiness.",
    ],
    verify: [
      "Node remains Ready for at least 15 minutes.",
      "No new NotReady events are generated for the same host.",
      "Workloads on that node resume normal latency and restart behavior.",
    ],
  },
  {
    id: "disk-pressure",
    title: "DiskPressure Cleanup",
    whenToUse: "DiskPressure warnings appear and pods begin eviction or image pull failures.",
    primaryGoal: "Free node disk safely and prevent repeated pressure transitions.",
    commands: [
      "kubectl describe node <node>",
      "kubectl get events -A | findstr DiskPressure",
      "kubectl get pods -A --field-selector spec.nodeName=<node>",
      "kubectl drain <node> --ignore-daemonsets --delete-emptydir-data --dry-run=server",
    ],
    steps: [
      "Cordon the node and review local storage consumers.",
      "Evict low-priority workloads first to reduce disk usage quickly.",
      "Validate image garbage collection or log cleanup happened at host level.",
      "Uncordon only after pressure condition clears.",
    ],
    verify: [
      "DiskPressure condition is False.",
      "New workloads schedule without image pull delays.",
      "No repeating eviction warnings after cleanup.",
    ],
  },
  {
    id: "eviction-storm",
    title: "Eviction Storm Containment",
    whenToUse: "Many pods evict within minutes across multiple namespaces.",
    primaryGoal: "Stop cascading restarts and identify shared capacity trigger.",
    commands: [
      "kubectl get events -A --sort-by=.metadata.creationTimestamp | findstr Evicted",
      "kubectl top nodes",
      "kubectl get pods -A --field-selector status.phase=Failed",
      "kubectl get pdb -A",
    ],
    steps: [
      "Identify whether memory, disk, or disruption budgets drive the evictions.",
      "Prioritize critical namespaces and protect them from further churn.",
      "Scale out capacity or reduce noisy background jobs.",
      "Recover affected workloads in dependency order.",
    ],
    verify: [
      "Eviction event rate drops to baseline.",
      "Critical services remain available during recovery.",
      "Cluster capacity margin returns above target threshold.",
    ],
  },
  {
    id: "kubelet-restart-storm",
    title: "Kubelet Restart Storm",
    whenToUse: "Node events indicate kubelet repeatedly restarting.",
    primaryGoal: "Prevent node flapping from destabilizing workload placement.",
    commands: [
      "kubectl describe node <node>",
      "kubectl get events -A --field-selector involvedObject.kind=Node,involvedObject.name=<node>",
      "kubectl get pods -A --field-selector spec.nodeName=<node>",
      "kubectl cordon <node>",
    ],
    steps: [
      "Cordon node to stop additional scheduling pressure.",
      "Capture timing and pattern of kubelet restarts from events.",
      "Drain non-critical pods if node stability remains poor.",
      "Return node only after sustained stable heartbeat.",
    ],
    verify: [
      "No new restart-related node warnings for target window.",
      "Node readiness remains steady after uncordon.",
      "Migrated workloads stay healthy on alternate nodes.",
    ],
  },
  {
    id: "time-skew",
    title: "Time Skew Correction",
    whenToUse: "Token validation, TLS, or distributed coordination fails due to clock drift.",
    primaryGoal: "Restore consistent time across nodes and control-plane components.",
    commands: [
      "kubectl get nodes -o wide",
      "kubectl get events -A | findstr certificate",
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl logs <pod> -n <namespace> --tail=200",
    ],
    steps: [
      "Identify nodes with suspected clock drift from error signatures.",
      "Temporarily shift critical workloads away from skewed nodes.",
      "Correct node time synchronization service out of band.",
      "Revalidate auth and TLS dependent workloads.",
    ],
    verify: [
      "Auth and TLS errors tied to time validation disappear.",
      "No repeated skew-related warnings in cluster events.",
      "Previously affected workloads stabilize without retries.",
    ],
  },
];
