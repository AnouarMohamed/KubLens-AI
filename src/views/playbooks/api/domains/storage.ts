import type { Playbook } from "../../types";

export const STORAGE_PLAYBOOKS: Playbook[] = [
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
    verify: ["PVC transitions to Bound.", "Dependent pods move to Running.", "No repeated provisioner failure events."],
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
];
