import type { Playbook } from "../../types";

export const SECURITY_PLAYBOOKS: Playbook[] = [
  {
    "id": "secret-rotation",
    "title": "Secret Rotation Incident",
    "whenToUse": "Rotated credentials cause authentication failures in running workloads.",
    "primaryGoal": "Restore auth quickly and complete safe rotation rollout.",
    "commands": [
      "kubectl get secret <secret> -n <namespace> -o yaml",
      "kubectl get deploy -n <namespace> -o yaml",
      "kubectl rollout restart deployment/<deployment> -n <namespace>",
      "kubectl logs <pod> -n <namespace> --tail=200"
    ],
    "steps": [
      "Validate secret keys and expected values format.",
      "Restart or roll workloads that read secret at startup.",
      "Confirm old credentials are retired only after new auth succeeds.",
      "Add rotation checklist to runbook to avoid staggering gaps."
    ],
    "verify": [
      "Authentication errors drop to baseline.",
      "All target pods have restarted on new secret revision.",
      "No stale secret references remain in deployment specs."
    ]
  },
  {
    "id": "cert-expiry",
    "title": "Certificate Expiry Response",
    "whenToUse": "TLS handshakes fail due to expired or invalid certificates.",
    "primaryGoal": "Restore encrypted traffic with valid chain and minimal downtime.",
    "commands": [
      "kubectl get secret -A | findstr tls",
      "kubectl describe ingress <name> -n <namespace>",
      "kubectl logs <ingress-controller-pod> -n <controller-namespace> --tail=200",
      "kubectl rollout restart deployment/<deployment> -n <namespace>"
    ],
    "steps": [
      "Identify expired cert and impacted hostnames.",
      "Rotate certificate secret and verify key pair integrity.",
      "Restart ingress or workload consumers if required.",
      "Add proactive expiration alerting window."
    ],
    "verify": [
      "TLS handshakes succeed for affected domains.",
      "Certificate expiration dates reflect new validity period.",
      "No further handshake failure bursts in events and logs."
    ]
  },
  {
    "id": "rbac-denials",
    "title": "RBAC Denial Burst",
    "whenToUse": "Workloads or operators receive repeated Forbidden errors.",
    "primaryGoal": "Restore required permissions with least-privilege scope.",
    "commands": [
      "kubectl auth can-i --as system:serviceaccount:<namespace>:<sa> <verb> <resource> -n <namespace>",
      "kubectl get role,rolebinding -n <namespace>",
      "kubectl get clusterrole,clusterrolebinding",
      "kubectl describe rolebinding <name> -n <namespace>"
    ],
    "steps": [
      "Identify failing principal and exact denied verb-resource pair.",
      "Grant only missing permissions to the correct role binding.",
      "Avoid broad cluster-admin escalation unless emergency approved.",
      "Re-run can-i checks for explicit coverage."
    ],
    "verify": [
      "Denied requests are resolved for intended principal.",
      "No unrelated principals gain expanded access.",
      "RBAC change is documented with owner and expiry if temporary."
    ]
  },
  {
    "id": "webhook-failure",
    "title": "Admission Webhook Failure",
    "whenToUse": "API writes fail because validating or mutating webhook is unavailable.",
    "primaryGoal": "Restore safe admission path and unblock critical changes.",
    "commands": [
      "kubectl get validatingwebhookconfigurations,mutatingwebhookconfigurations",
      "kubectl describe validatingwebhookconfiguration <name>",
      "kubectl get pods -A -l app=<webhook-app>",
      "kubectl logs <webhook-pod> -n <namespace> --tail=200"
    ],
    "steps": [
      "Determine whether failure policy is Fail or Ignore.",
      "Recover webhook service and certificate chain first.",
      "For emergencies, apply approved temporary fail-open exception.",
      "Revert exception after webhook health is restored."
    ],
    "verify": [
      "Previously blocked API writes now succeed safely.",
      "Webhook latency and error rate return to normal.",
      "Temporary policy exceptions are removed and audited."
    ]
  }
];
