interface Playbook {
  id: string;
  title: string;
  whenToUse: string;
  primaryGoal: string;
  commands: string[];
  steps: string[];
  verify: string[];
}

const PLAYBOOKS: Playbook[] = [
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
    id: "crash-loop",
    title: "CrashLoopBackOff Burst",
    whenToUse: "Multiple pods restart repeatedly in one namespace or service tier.",
    primaryGoal: "Contain blast radius quickly and recover service by finding the first failing dependency.",
    commands: [
      "kubectl get pods -A | findstr CrashLoopBackOff",
      "kubectl logs <pod> -n <namespace> --previous --tail=200",
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl rollout history deployment/<deployment> -n <namespace>",
    ],
    steps: [
      "Group failing pods by deployment and identify the first restart time.",
      "Check image/config/secret changes landed immediately before the failures.",
      "Rollback or restart only the affected workload group; avoid whole-cluster actions.",
      "Record the confirmed fix pattern in Cluster Memory.",
    ],
    verify: [
      "Restart count stops increasing for 15 minutes.",
      "Service-level error rate returns to baseline.",
      "Predictions view no longer ranks the same workload as high risk.",
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
    id: "image-pull-backoff",
    title: "ImagePullBackOff Recovery",
    whenToUse: "New pods fail with image pull errors during rollout or autoscaling.",
    primaryGoal: "Restore image availability and prevent repeated failed scheduling attempts.",
    commands: [
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl get secret -n <namespace>",
      "kubectl get serviceaccount <sa> -n <namespace> -o yaml",
      "kubectl rollout pause deployment/<deployment> -n <namespace>",
    ],
    steps: [
      "Confirm image name and tag are valid and accessible.",
      "Validate image pull secret is present and bound to the service account.",
      "Pause rollout while fixing credentials or registry path.",
      "Resume rollout and watch new pod pulls.",
    ],
    verify: [
      "New pods transition to Running without pull errors.",
      "No new Failed to pull image events for the deployment.",
      "Rollout reaches desired ready replicas.",
    ],
  },
  {
    id: "pod-pending-scheduling",
    title: "Pending Pod Scheduling Deadlock",
    whenToUse: "Pods stay Pending due to unschedulable resource or affinity constraints.",
    primaryGoal: "Resolve scheduling blockers with minimal policy drift.",
    commands: [
      "kubectl get pods -A --field-selector status.phase=Pending",
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl get nodes -o custom-columns=NAME:.metadata.name,TAINTS:.spec.taints",
      "kubectl describe quota -n <namespace>",
    ],
    steps: [
      "Read scheduler events to identify exact unschedulable reason.",
      "Check taints, tolerations, node selectors, and affinity mismatch.",
      "Adjust requests, quota, or scheduling policy in the owning manifest.",
      "Reconcile with capacity team if demand exceeds cluster supply.",
    ],
    verify: [
      "Pods move from Pending to Running in target namespace.",
      "Scheduler warnings stop repeating for the same workload.",
      "No emergency taint removals remain undocumented.",
    ],
  },
  {
    id: "oom-killed",
    title: "OOMKilled Repeated Restarts",
    whenToUse: "Containers terminate with OOMKilled and restart continuously.",
    primaryGoal: "Balance requests and limits to stop memory exhaustion without over-provisioning.",
    commands: [
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl top pod <pod> -n <namespace> --containers",
      "kubectl get deploy <deployment> -n <namespace> -o yaml",
      "kubectl logs <pod> -n <namespace> --previous --tail=200",
    ],
    steps: [
      "Confirm OOMKilled reason in last container state.",
      "Compare observed memory peak against configured limits.",
      "Raise limits and requests or reduce concurrency in app settings.",
      "Roll workload gradually and monitor memory curve.",
    ],
    verify: [
      "No further OOMKilled terminations for updated pods.",
      "Pod restart rate returns to normal.",
      "Node memory pressure does not increase after the change.",
    ],
  },
  {
    id: "probe-failures",
    title: "Probe Failure Stabilization",
    whenToUse: "Readiness or liveness probe failures cause restart churn.",
    primaryGoal: "Align probe behavior with real startup and dependency timing.",
    commands: [
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl logs <pod> -n <namespace> --tail=200",
      "kubectl get deploy <deployment> -n <namespace> -o yaml",
      "kubectl rollout restart deployment/<deployment> -n <namespace>",
    ],
    steps: [
      "Differentiate liveness failure from readiness failure impact.",
      "Increase initialDelaySeconds and timeoutSeconds if startup is slow.",
      "Confirm probe path and port target the real health endpoint.",
      "Roll one replica first before full rollout.",
    ],
    verify: [
      "Probe failures stop for newly rolled pods.",
      "Readiness reaches steady state within expected startup window.",
      "No increase in 5xx during rollout.",
    ],
  },
  {
    id: "rollout-stuck",
    title: "Deployment Rollout Stuck",
    whenToUse: "Deployment update hangs with unavailable or unready replicas.",
    primaryGoal: "Unblock rollout safely and preserve service availability.",
    commands: [
      "kubectl rollout status deployment/<deployment> -n <namespace>",
      "kubectl describe deployment <deployment> -n <namespace>",
      "kubectl get rs -n <namespace> -l app=<label>",
      "kubectl get pods -n <namespace> -l app=<label>",
    ],
    steps: [
      "Identify whether failure is scheduling, probes, or image pull.",
      "Pause rollout if error budget is at risk.",
      "Fix root issue and resume or rollback deliberately.",
      "Document failed revision details for postmortem context.",
    ],
    verify: [
      "Rollout completes with desired ready replicas.",
      "Old ReplicaSet scales down as expected.",
      "No sustained warning events for the deployment.",
    ],
  },
  {
    id: "canary-rollback",
    title: "Canary Rollback Procedure",
    whenToUse: "Canary shows elevated errors after release.",
    primaryGoal: "Revert quickly while preserving debug evidence from failing version.",
    commands: [
      "kubectl rollout history deployment/<deployment> -n <namespace>",
      "kubectl rollout undo deployment/<deployment> -n <namespace>",
      "kubectl get pods -n <namespace> -l app=<label>",
      "kubectl logs <pod> -n <namespace> --tail=300",
    ],
    steps: [
      "Capture failing pod logs and key metrics before rollback.",
      "Rollback to last known good revision.",
      "Confirm traffic is shifted off canary replicas.",
      "Open remediation proposal for safer re-release.",
    ],
    verify: [
      "Error rate drops to pre-release baseline.",
      "No new pods from bad revision remain ready.",
      "User impact window is documented with start and end times.",
    ],
  },
  {
    id: "statefulset-stuck",
    title: "StatefulSet Progression Block",
    whenToUse: "StatefulSet cannot scale or update due to ordered pod failures.",
    primaryGoal: "Recover ordered replica progression without data loss.",
    commands: [
      "kubectl describe statefulset <name> -n <namespace>",
      "kubectl get pods -n <namespace> -l statefulset.kubernetes.io/pod-name",
      "kubectl get pvc -n <namespace>",
      "kubectl logs <pod> -n <namespace> --tail=200",
    ],
    steps: [
      "Identify first ordinal pod blocking progression.",
      "Validate volume claim status and attachment health.",
      "Fix app or storage issue for blocking ordinal before continuing.",
      "Resume ordered rollout and monitor each ordinal transition.",
    ],
    verify: [
      "All ordinals become Ready in sequence.",
      "PVCs remain Bound and attached to intended pods.",
      "No forced deletion occurred without recovery plan.",
    ],
  },
  {
    id: "job-failing",
    title: "Batch Job Failure Loop",
    whenToUse: "Jobs fail repeatedly and hit backoff limit.",
    primaryGoal: "Recover batch processing while avoiding duplicate side effects.",
    commands: [
      "kubectl get jobs -A",
      "kubectl describe job <job> -n <namespace>",
      "kubectl logs job/<job> -n <namespace> --tail=300",
      "kubectl get pods -n <namespace> -l job-name=<job>",
    ],
    steps: [
      "Check failure mode and whether outputs are partially committed.",
      "Pause dependent pipelines if duplicate execution is risky.",
      "Patch job command or environment and rerun with clear audit note.",
      "Set appropriate backoffLimit and activeDeadlineSeconds.",
    ],
    verify: [
      "Next run completes successfully.",
      "No duplicate writes or duplicate notifications were emitted.",
      "Failed pods are cleaned and no new backoff warnings appear.",
    ],
  },
  {
    id: "cronjob-missed",
    title: "CronJob Missed Schedules",
    whenToUse: "Expected recurring jobs do not trigger on schedule.",
    primaryGoal: "Restore schedule execution and prevent silent misses.",
    commands: [
      "kubectl get cronjob -A",
      "kubectl describe cronjob <name> -n <namespace>",
      "kubectl get jobs -n <namespace> --sort-by=.metadata.creationTimestamp",
      "kubectl create job --from=cronjob/<name> manual-<name> -n <namespace>",
    ],
    steps: [
      "Inspect lastScheduleTime and failed scheduling events.",
      "Validate timezone and schedule expression correctness.",
      "Run one manual job to verify runtime dependencies.",
      "Correct schedule and confirm next tick executes.",
    ],
    verify: [
      "New scheduled jobs appear at expected intervals.",
      "Manual trigger succeeds with expected outputs.",
      "No new schedule parsing or startingDeadlineSeconds warnings.",
    ],
  },
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
  {
    id: "pvc-pending",
    title: "PersistentVolumeClaim Pending",
    whenToUse: "Workloads cannot start because PVC stays Pending.",
    primaryGoal: "Bind storage quickly while preserving class and access guarantees.",
    commands: [
      "kubectl get pvc -A",
      "kubectl describe pvc <name> -n <namespace>",
      "kubectl get storageclass",
      "kubectl get pv",
    ],
    steps: [
      "Confirm requested storage class exists and is healthy.",
      "Check capacity and access mode compatibility.",
      "Provision or expand backing storage as needed.",
      "Retry pod scheduling only after claim is Bound.",
    ],
    verify: [
      "PVC transitions to Bound.",
      "Dependent pods move to Running.",
      "No repeated provisioner failure events.",
    ],
  },
  {
    id: "volume-attach-failure",
    title: "Volume Attach and Mount Failure",
    whenToUse: "Pods fail with mount timeout or attachment errors.",
    primaryGoal: "Recover storage attachment path without unsafe pod deletion.",
    commands: [
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl get volumeattachments",
      "kubectl describe pvc <pvc> -n <namespace>",
      "kubectl get events -A | findstr AttachVolume",
    ],
    steps: [
      "Identify whether attach or mount phase is failing.",
      "Check stale attachments after node crash or forced termination.",
      "Restart workload only after attachment state is consistent.",
      "Escalate to storage platform owner for backend-level fault.",
    ],
    verify: [
      "Pods mount volume and transition to Running.",
      "Attach timeout warnings stop for affected claim.",
      "No duplicate attachment records remain stale.",
    ],
  },
  {
    id: "secret-rotation",
    title: "Secret Rotation Incident",
    whenToUse: "Rotated credentials cause authentication failures in running workloads.",
    primaryGoal: "Restore auth quickly and complete safe rotation rollout.",
    commands: [
      "kubectl get secret <secret> -n <namespace> -o yaml",
      "kubectl get deploy -n <namespace> -o yaml",
      "kubectl rollout restart deployment/<deployment> -n <namespace>",
      "kubectl logs <pod> -n <namespace> --tail=200",
    ],
    steps: [
      "Validate secret keys and expected values format.",
      "Restart or roll workloads that read secret at startup.",
      "Confirm old credentials are retired only after new auth succeeds.",
      "Add rotation checklist to runbook to avoid staggering gaps.",
    ],
    verify: [
      "Authentication errors drop to baseline.",
      "All target pods have restarted on new secret revision.",
      "No stale secret references remain in deployment specs.",
    ],
  },
  {
    id: "configmap-regression",
    title: "ConfigMap Regression Rollback",
    whenToUse: "Config update causes immediate service degradation.",
    primaryGoal: "Rollback bad configuration and restore healthy behavior.",
    commands: [
      "kubectl get configmap <name> -n <namespace> -o yaml",
      "kubectl rollout history deployment/<deployment> -n <namespace>",
      "kubectl rollout undo deployment/<deployment> -n <namespace>",
      "kubectl logs <pod> -n <namespace> --tail=200",
    ],
    steps: [
      "Confirm change window aligns with error spike.",
      "Rollback workload to last known good revision.",
      "Patch ConfigMap with corrected values in a staged branch.",
      "Re-roll deployment with pre-flight validation.",
    ],
    verify: [
      "Service error rate returns to baseline.",
      "Config-related exceptions no longer appear in logs.",
      "Updated runbook includes config validation gates.",
    ],
  },
  {
    id: "cert-expiry",
    title: "Certificate Expiry Response",
    whenToUse: "TLS handshakes fail due to expired or invalid certificates.",
    primaryGoal: "Restore encrypted traffic with valid chain and minimal downtime.",
    commands: [
      "kubectl get secret -A | findstr tls",
      "kubectl describe ingress <name> -n <namespace>",
      "kubectl logs <ingress-controller-pod> -n <controller-namespace> --tail=200",
      "kubectl rollout restart deployment/<deployment> -n <namespace>",
    ],
    steps: [
      "Identify expired cert and impacted hostnames.",
      "Rotate certificate secret and verify key pair integrity.",
      "Restart ingress or workload consumers if required.",
      "Add proactive expiration alerting window.",
    ],
    verify: [
      "TLS handshakes succeed for affected domains.",
      "Certificate expiration dates reflect new validity period.",
      "No further handshake failure bursts in events and logs.",
    ],
  },
  {
    id: "rbac-denials",
    title: "RBAC Denial Burst",
    whenToUse: "Workloads or operators receive repeated Forbidden errors.",
    primaryGoal: "Restore required permissions with least-privilege scope.",
    commands: [
      "kubectl auth can-i --as system:serviceaccount:<namespace>:<sa> <verb> <resource> -n <namespace>",
      "kubectl get role,rolebinding -n <namespace>",
      "kubectl get clusterrole,clusterrolebinding",
      "kubectl describe rolebinding <name> -n <namespace>",
    ],
    steps: [
      "Identify failing principal and exact denied verb-resource pair.",
      "Grant only missing permissions to the correct role binding.",
      "Avoid broad cluster-admin escalation unless emergency approved.",
      "Re-run can-i checks for explicit coverage.",
    ],
    verify: [
      "Denied requests are resolved for intended principal.",
      "No unrelated principals gain expanded access.",
      "RBAC change is documented with owner and expiry if temporary.",
    ],
  },
  {
    id: "api-throttling",
    title: "Kubernetes API Throttling",
    whenToUse: "Controllers or operators hit client-side or server-side request throttling.",
    primaryGoal: "Reduce API pressure and restore control loop responsiveness.",
    commands: [
      "kubectl get events -A | findstr thrott",
      "kubectl top pods -A",
      "kubectl logs <controller-pod> -n <namespace> --tail=200",
      "kubectl get apiservices",
    ],
    steps: [
      "Identify the top clients generating burst traffic.",
      "Reduce polling frequency or parallel reconciliation temporarily.",
      "Scale critical controllers carefully if CPU-starved.",
      "Plan long-term API usage optimization in controller configs.",
    ],
    verify: [
      "Throttle warnings decrease significantly.",
      "Control loops converge within expected timing.",
      "No new backlog growth in queued reconciliation workloads.",
    ],
  },
  {
    id: "hpa-thrash",
    title: "Autoscaler Thrash Control",
    whenToUse: "HPA scales up and down rapidly with unstable replica counts.",
    primaryGoal: "Stabilize scaling decisions and reduce workload churn.",
    commands: [
      "kubectl get hpa -A",
      "kubectl describe hpa <name> -n <namespace>",
      "kubectl top pod -n <namespace> -l app=<label>",
      "kubectl get deploy <deployment> -n <namespace> -o yaml",
    ],
    steps: [
      "Check target metric volatility and sample freshness.",
      "Tune stabilizationWindowSeconds and scale policies.",
      "Adjust requests to improve metric signal quality.",
      "Re-evaluate minReplicas and maxReplicas range.",
    ],
    verify: [
      "Replica count changes become smoother and less frequent.",
      "Service latency remains stable during load shifts.",
      "HPA events show expected policy-controlled scaling.",
    ],
  },
  {
    id: "webhook-failure",
    title: "Admission Webhook Failure",
    whenToUse: "API writes fail because validating or mutating webhook is unavailable.",
    primaryGoal: "Restore safe admission path and unblock critical changes.",
    commands: [
      "kubectl get validatingwebhookconfigurations,mutatingwebhookconfigurations",
      "kubectl describe validatingwebhookconfiguration <name>",
      "kubectl get pods -A -l app=<webhook-app>",
      "kubectl logs <webhook-pod> -n <namespace> --tail=200",
    ],
    steps: [
      "Determine whether failure policy is Fail or Ignore.",
      "Recover webhook service and certificate chain first.",
      "For emergencies, apply approved temporary fail-open exception.",
      "Revert exception after webhook health is restored.",
    ],
    verify: [
      "Previously blocked API writes now succeed safely.",
      "Webhook latency and error rate return to normal.",
      "Temporary policy exceptions are removed and audited.",
    ],
  },
  {
    id: "control-plane-latency",
    title: "Control Plane Latency Spike",
    whenToUse: "Cluster API operations and reconciliations become unusually slow.",
    primaryGoal: "Recover control plane responsiveness before workload impact escalates.",
    commands: [
      "kubectl get --raw /readyz?verbose",
      "kubectl get componentstatuses",
      "kubectl get events -A --sort-by=.metadata.creationTimestamp",
      "kubectl top nodes",
    ],
    steps: [
      "Identify whether latency is API server, etcd, or network related.",
      "Reduce non-critical change traffic during incident window.",
      "Prioritize core control-plane health checks and restart degraded components when appropriate.",
      "Coordinate with platform owner for managed control-plane incidents.",
    ],
    verify: [
      "Readiness endpoints report healthy checks consistently.",
      "Reconciliation delays and event lag return to baseline.",
      "Mutation request latency no longer breaches SLO.",
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
  {
    id: "alert-fatigue",
    title: "Alert Fatigue Control",
    whenToUse: "Node rule alerts repeat faster than the team can act on them.",
    primaryGoal: "Preserve signal quality by acknowledging, snoozing, or dismissing with intent.",
    commands: [
      "kubectl get events -A --sort-by=.metadata.creationTimestamp",
      "kubectl describe node <node>",
    ],
    steps: [
      "Acknowledge alerts with a known, active mitigation in progress.",
      "Snooze alerts during maintenance windows with a bounded duration.",
      "Dismiss stale alerts only when root cause is resolved and verified.",
      "Reopen dismissed alerts immediately if the symptom returns.",
    ],
    verify: [
      "Alert queue reflects active risks, not historical noise.",
      "Snoozed alerts automatically return to active after expiry.",
      "Audit trail captures operator actions for review.",
    ],
  },
];

export default function Playbooks() {
  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Playbooks</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Practical response guides for recurring incidents, optimized for fast triage and safe execution.
          </p>
        </div>
      </header>

      <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Usage model</p>
        <p className="mt-2 text-sm text-zinc-300">
          Pick a playbook by symptom, execute commands in sequence, and validate outcomes before closing the incident.
        </p>
        <p className="mt-1 text-xs text-zinc-500">{PLAYBOOKS.length} playbooks currently available.</p>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {PLAYBOOKS.map((playbook) => (
          <article key={playbook.id} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">{playbook.title}</h3>
              <p className="mt-1 text-sm text-zinc-400">{playbook.whenToUse}</p>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Primary goal</p>
              <p className="mt-1 text-sm text-zinc-200">{playbook.primaryGoal}</p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Command sequence</p>
              <pre className="mt-2 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-200">
                {playbook.commands.join("\n")}
              </pre>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Execution steps</p>
              <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-zinc-300">
                {playbook.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Exit criteria</p>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-zinc-300">
                {playbook.verify.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
