import type { Playbook } from "../../types";

export const WORKLOAD_PLAYBOOKS: Playbook[] = [
  {
    "id": "crash-loop",
    "title": "CrashLoopBackOff Burst",
    "whenToUse": "Multiple pods restart repeatedly in one namespace or service tier.",
    "primaryGoal": "Contain blast radius quickly and recover service by finding the first failing dependency.",
    "commands": [
      "kubectl get pods -A | findstr CrashLoopBackOff",
      "kubectl logs <pod> -n <namespace> --previous --tail=200",
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl rollout history deployment/<deployment> -n <namespace>"
    ],
    "steps": [
      "Group failing pods by deployment and identify the first restart time.",
      "Check image/config/secret changes landed immediately before the failures.",
      "Rollback or restart only the affected workload group; avoid whole-cluster actions.",
      "Record the confirmed fix pattern in Cluster Memory."
    ],
    "verify": [
      "Restart count stops increasing for 15 minutes.",
      "Service-level error rate returns to baseline.",
      "Predictions view no longer ranks the same workload as high risk."
    ]
  },
  {
    "id": "image-pull-backoff",
    "title": "ImagePullBackOff Recovery",
    "whenToUse": "New pods fail with image pull errors during rollout or autoscaling.",
    "primaryGoal": "Restore image availability and prevent repeated failed scheduling attempts.",
    "commands": [
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl get secret -n <namespace>",
      "kubectl get serviceaccount <sa> -n <namespace> -o yaml",
      "kubectl rollout pause deployment/<deployment> -n <namespace>"
    ],
    "steps": [
      "Confirm image name and tag are valid and accessible.",
      "Validate image pull secret is present and bound to the service account.",
      "Pause rollout while fixing credentials or registry path.",
      "Resume rollout and watch new pod pulls."
    ],
    "verify": [
      "New pods transition to Running without pull errors.",
      "No new Failed to pull image events for the deployment.",
      "Rollout reaches desired ready replicas."
    ]
  },
  {
    "id": "pod-pending-scheduling",
    "title": "Pending Pod Scheduling Deadlock",
    "whenToUse": "Pods stay Pending due to unschedulable resource or affinity constraints.",
    "primaryGoal": "Resolve scheduling blockers with minimal policy drift.",
    "commands": [
      "kubectl get pods -A --field-selector status.phase=Pending",
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl get nodes -o custom-columns=NAME:.metadata.name,TAINTS:.spec.taints",
      "kubectl describe quota -n <namespace>"
    ],
    "steps": [
      "Read scheduler events to identify exact unschedulable reason.",
      "Check taints, tolerations, node selectors, and affinity mismatch.",
      "Adjust requests, quota, or scheduling policy in the owning manifest.",
      "Reconcile with capacity team if demand exceeds cluster supply."
    ],
    "verify": [
      "Pods move from Pending to Running in target namespace.",
      "Scheduler warnings stop repeating for the same workload.",
      "No emergency taint removals remain undocumented."
    ]
  },
  {
    "id": "oom-killed",
    "title": "OOMKilled Repeated Restarts",
    "whenToUse": "Containers terminate with OOMKilled and restart continuously.",
    "primaryGoal": "Balance requests and limits to stop memory exhaustion without over-provisioning.",
    "commands": [
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl top pod <pod> -n <namespace> --containers",
      "kubectl get deploy <deployment> -n <namespace> -o yaml",
      "kubectl logs <pod> -n <namespace> --previous --tail=200"
    ],
    "steps": [
      "Confirm OOMKilled reason in last container state.",
      "Compare observed memory peak against configured limits.",
      "Raise limits and requests or reduce concurrency in app settings.",
      "Roll workload gradually and monitor memory curve."
    ],
    "verify": [
      "No further OOMKilled terminations for updated pods.",
      "Pod restart rate returns to normal.",
      "Node memory pressure does not increase after the change."
    ]
  },
  {
    "id": "probe-failures",
    "title": "Probe Failure Stabilization",
    "whenToUse": "Readiness or liveness probe failures cause restart churn.",
    "primaryGoal": "Align probe behavior with real startup and dependency timing.",
    "commands": [
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl logs <pod> -n <namespace> --tail=200",
      "kubectl get deploy <deployment> -n <namespace> -o yaml",
      "kubectl rollout restart deployment/<deployment> -n <namespace>"
    ],
    "steps": [
      "Differentiate liveness failure from readiness failure impact.",
      "Increase initialDelaySeconds and timeoutSeconds if startup is slow.",
      "Confirm probe path and port target the real health endpoint.",
      "Roll one replica first before full rollout."
    ],
    "verify": [
      "Probe failures stop for newly rolled pods.",
      "Readiness reaches steady state within expected startup window.",
      "No increase in 5xx during rollout."
    ]
  },
  {
    "id": "rollout-stuck",
    "title": "Deployment Rollout Stuck",
    "whenToUse": "Deployment update hangs with unavailable or unready replicas.",
    "primaryGoal": "Unblock rollout safely and preserve service availability.",
    "commands": [
      "kubectl rollout status deployment/<deployment> -n <namespace>",
      "kubectl describe deployment <deployment> -n <namespace>",
      "kubectl get rs -n <namespace> -l app=<label>",
      "kubectl get pods -n <namespace> -l app=<label>"
    ],
    "steps": [
      "Identify whether failure is scheduling, probes, or image pull.",
      "Pause rollout if error budget is at risk.",
      "Fix root issue and resume or rollback deliberately.",
      "Document failed revision details for postmortem context."
    ],
    "verify": [
      "Rollout completes with desired ready replicas.",
      "Old ReplicaSet scales down as expected.",
      "No sustained warning events for the deployment."
    ]
  },
  {
    "id": "canary-rollback",
    "title": "Canary Rollback Procedure",
    "whenToUse": "Canary shows elevated errors after release.",
    "primaryGoal": "Revert quickly while preserving debug evidence from failing version.",
    "commands": [
      "kubectl rollout history deployment/<deployment> -n <namespace>",
      "kubectl rollout undo deployment/<deployment> -n <namespace>",
      "kubectl get pods -n <namespace> -l app=<label>",
      "kubectl logs <pod> -n <namespace> --tail=300"
    ],
    "steps": [
      "Capture failing pod logs and key metrics before rollback.",
      "Rollback to last known good revision.",
      "Confirm traffic is shifted off canary replicas.",
      "Open remediation proposal for safer re-release."
    ],
    "verify": [
      "Error rate drops to pre-release baseline.",
      "No new pods from bad revision remain ready.",
      "User impact window is documented with start and end times."
    ]
  },
  {
    "id": "statefulset-stuck",
    "title": "StatefulSet Progression Block",
    "whenToUse": "StatefulSet cannot scale or update due to ordered pod failures.",
    "primaryGoal": "Recover ordered replica progression without data loss.",
    "commands": [
      "kubectl describe statefulset <name> -n <namespace>",
      "kubectl get pods -n <namespace> -l statefulset.kubernetes.io/pod-name",
      "kubectl get pvc -n <namespace>",
      "kubectl logs <pod> -n <namespace> --tail=200"
    ],
    "steps": [
      "Identify first ordinal pod blocking progression.",
      "Validate volume claim status and attachment health.",
      "Fix app or storage issue for blocking ordinal before continuing.",
      "Resume ordered rollout and monitor each ordinal transition."
    ],
    "verify": [
      "All ordinals become Ready in sequence.",
      "PVCs remain Bound and attached to intended pods.",
      "No forced deletion occurred without recovery plan."
    ]
  },
  {
    "id": "job-failing",
    "title": "Batch Job Failure Loop",
    "whenToUse": "Jobs fail repeatedly and hit backoff limit.",
    "primaryGoal": "Recover batch processing while avoiding duplicate side effects.",
    "commands": [
      "kubectl get jobs -A",
      "kubectl describe job <job> -n <namespace>",
      "kubectl logs job/<job> -n <namespace> --tail=300",
      "kubectl get pods -n <namespace> -l job-name=<job>"
    ],
    "steps": [
      "Check failure mode and whether outputs are partially committed.",
      "Pause dependent pipelines if duplicate execution is risky.",
      "Patch job command or environment and rerun with clear audit note.",
      "Set appropriate backoffLimit and activeDeadlineSeconds."
    ],
    "verify": [
      "Next run completes successfully.",
      "No duplicate writes or duplicate notifications were emitted.",
      "Failed pods are cleaned and no new backoff warnings appear."
    ]
  },
  {
    "id": "cronjob-missed",
    "title": "CronJob Missed Schedules",
    "whenToUse": "Expected recurring jobs do not trigger on schedule.",
    "primaryGoal": "Restore schedule execution and prevent silent misses.",
    "commands": [
      "kubectl get cronjob -A",
      "kubectl describe cronjob <name> -n <namespace>",
      "kubectl get jobs -n <namespace> --sort-by=.metadata.creationTimestamp",
      "kubectl create job --from=cronjob/<name> manual-<name> -n <namespace>"
    ],
    "steps": [
      "Inspect lastScheduleTime and failed scheduling events.",
      "Validate timezone and schedule expression correctness.",
      "Run one manual job to verify runtime dependencies.",
      "Correct schedule and confirm next tick executes."
    ],
    "verify": [
      "New scheduled jobs appear at expected intervals.",
      "Manual trigger succeeds with expected outputs.",
      "No new schedule parsing or startingDeadlineSeconds warnings."
    ]
  },
  {
    "id": "configmap-regression",
    "title": "ConfigMap Regression Rollback",
    "whenToUse": "Config update causes immediate service degradation.",
    "primaryGoal": "Rollback bad configuration and restore healthy behavior.",
    "commands": [
      "kubectl get configmap <name> -n <namespace> -o yaml",
      "kubectl rollout history deployment/<deployment> -n <namespace>",
      "kubectl rollout undo deployment/<deployment> -n <namespace>",
      "kubectl logs <pod> -n <namespace> --tail=200"
    ],
    "steps": [
      "Confirm change window aligns with error spike.",
      "Rollback workload to last known good revision.",
      "Patch ConfigMap with corrected values in a staged branch.",
      "Re-roll deployment with pre-flight validation."
    ],
    "verify": [
      "Service error rate returns to baseline.",
      "Config-related exceptions no longer appear in logs.",
      "Updated runbook includes config validation gates."
    ]
  },
  {
    "id": "hpa-thrash",
    "title": "Autoscaler Thrash Control",
    "whenToUse": "HPA scales up and down rapidly with unstable replica counts.",
    "primaryGoal": "Stabilize scaling decisions and reduce workload churn.",
    "commands": [
      "kubectl get hpa -A",
      "kubectl describe hpa <name> -n <namespace>",
      "kubectl top pod -n <namespace> -l app=<label>",
      "kubectl get deploy <deployment> -n <namespace> -o yaml"
    ],
    "steps": [
      "Check target metric volatility and sample freshness.",
      "Tune stabilizationWindowSeconds and scale policies.",
      "Adjust requests to improve metric signal quality.",
      "Re-evaluate minReplicas and maxReplicas range."
    ],
    "verify": [
      "Replica count changes become smoother and less frequent.",
      "Service latency remains stable during load shifts.",
      "HPA events show expected policy-controlled scaling."
    ]
  }
];
