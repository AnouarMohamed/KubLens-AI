export interface AuditEntry {
  id: string;
  timestamp: string;
  requestId?: string;
  method: string;
  path: string;
  route?: string;
  action?: string;
  status: number;
  durationMs: number;
  bytes: number;
  clientIp?: string;
  user?: string;
  role?: string;
  success: boolean;
}

export interface AuditLogResponse {
  total: number;
  items: AuditEntry[];
}

export interface StreamEvent<T = unknown> {
  type: string;
  timestamp: string;
  payload: T;
}
