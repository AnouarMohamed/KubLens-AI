import type {
  AlertDispatchRequest,
  AlertDispatchResponse,
  AuditLogResponse,
  NodeAlertLifecycle,
  NodeAlertLifecycleUpdateRequest,
} from "../../../types";
import { apiPath, requestJson } from "../core";

export const alertsApi = {
  dispatchAlert: (payload: AlertDispatchRequest) =>
    requestJson<AlertDispatchResponse>(apiPath("alerts", "dispatch"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sendTestAlert: () =>
    requestJson<AlertDispatchResponse>(apiPath("alerts", "test"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  getAlertLifecycle: () => requestJson<NodeAlertLifecycle[]>(apiPath("alerts", "lifecycle")),
  updateAlertLifecycle: (payload: NodeAlertLifecycleUpdateRequest) =>
    requestJson<NodeAlertLifecycle>(apiPath("alerts", "lifecycle"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAuditLog: (limit = 120) => requestJson<AuditLogResponse>(`${apiPath("audit")}?limit=${limit}`),
};
