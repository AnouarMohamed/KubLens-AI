import type { Playbook } from "../../types";

export const PLATFORM_PLAYBOOKS: Playbook[] = [
  {
    "id": "api-throttling",
    "title": "Kubernetes API Throttling",
    "whenToUse": "Controllers or operators hit client-side or server-side request throttling.",
    "primaryGoal": "Reduce API pressure and restore control loop responsiveness.",
    "commands": [
      "kubectl get events -A | findstr thrott",
      "kubectl top pods -A",
      "kubectl logs <controller-pod> -n <namespace> --tail=200",
      "kubectl get apiservices"
    ],
    "steps": [
      "Identify the top clients generating burst traffic.",
      "Reduce polling frequency or parallel reconciliation temporarily.",
      "Scale critical controllers carefully if CPU-starved.",
      "Plan long-term API usage optimization in controller configs."
    ],
    "verify": [
      "Throttle warnings decrease significantly.",
      "Control loops converge within expected timing.",
      "No new backlog growth in queued reconciliation workloads."
    ]
  },
  {
    "id": "control-plane-latency",
    "title": "Control Plane Latency Spike",
    "whenToUse": "Cluster API operations and reconciliations become unusually slow.",
    "primaryGoal": "Recover control plane responsiveness before workload impact escalates.",
    "commands": [
      "kubectl get --raw /readyz?verbose",
      "kubectl get componentstatuses",
      "kubectl get events -A --sort-by=.metadata.creationTimestamp",
      "kubectl top nodes"
    ],
    "steps": [
      "Identify whether latency is API server, etcd, or network related.",
      "Reduce non-critical change traffic during incident window.",
      "Prioritize core control-plane health checks and restart degraded components when appropriate.",
      "Coordinate with platform owner for managed control-plane incidents."
    ],
    "verify": [
      "Readiness endpoints report healthy checks consistently.",
      "Reconciliation delays and event lag return to baseline.",
      "Mutation request latency no longer breaches SLO."
    ]
  },
  {
    "id": "alert-fatigue",
    "title": "Alert Fatigue Control",
    "whenToUse": "Node rule alerts repeat faster than the team can act on them.",
    "primaryGoal": "Preserve signal quality by acknowledging, snoozing, or dismissing with intent.",
    "commands": [
      "kubectl get events -A --sort-by=.metadata.creationTimestamp",
      "kubectl describe node <node>"
    ],
    "steps": [
      "Acknowledge alerts with a known, active mitigation in progress.",
      "Snooze alerts during maintenance windows with a bounded duration.",
      "Dismiss stale alerts only when root cause is resolved and verified.",
      "Reopen dismissed alerts immediately if the symptom returns."
    ],
    "verify": [
      "Alert queue reflects active risks, not historical noise.",
      "Snoozed alerts automatically return to active after expiry.",
      "Audit trail captures operator actions for review."
    ]
  }
];
