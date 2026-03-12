import type { NodeAlertLifecycleStatus } from "../../../types";

export interface NodeRuleAlert {
  id: string;
  node: string;
  rule: "readiness_flap" | "sustained_pressure" | "allocatable_drop";
  severity: "warning" | "critical";
  title: string;
  message: string;
  lifecycleStatus: NodeAlertLifecycleStatus;
  lifecycleNote?: string;
  lifecycleUpdatedAt?: string;
  lifecycleUpdatedBy?: string;
  snoozedUntil?: string;
}

export interface NodeDrainOptions {
  force?: boolean;
  reason?: string;
}
