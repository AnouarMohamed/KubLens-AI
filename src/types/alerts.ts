export interface AlertDispatchRequest {
  title: string;
  message: string;
  severity?: string;
  source?: string;
  tags?: string[];
}

export interface AlertChannelResult {
  channel: string;
  success: boolean;
  error?: string;
}

export interface AlertDispatchResponse {
  success: boolean;
  results: AlertChannelResult[];
}

export type NodeAlertLifecycleStatus = "active" | "acknowledged" | "snoozed" | "dismissed";

export interface NodeAlertLifecycle {
  id: string;
  node: string;
  rule: string;
  status: NodeAlertLifecycleStatus;
  note?: string;
  snoozedUntil?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface NodeAlertLifecycleUpdateRequest {
  id: string;
  node: string;
  rule: string;
  status: NodeAlertLifecycleStatus;
  note?: string;
  snoozeMinutes?: number;
}
