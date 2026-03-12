import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "../../../lib/api";
import type { NodeAlertLifecycle } from "../../../types";
import type { NodeRuleAlert } from "./nodesTypes";

interface UseNodeAlertActionsParams {
  canWrite: boolean;
  nodeRuleAlerts: NodeRuleAlert[];
  reportError: (message: string) => void;
  reportNotice: (message: string) => void;
  setAlertLifecycleByID: Dispatch<SetStateAction<Record<string, NodeAlertLifecycle>>>;
}

export function useNodeAlertActions({
  canWrite,
  nodeRuleAlerts,
  reportError,
  reportNotice,
  setAlertLifecycleByID,
}: UseNodeAlertActionsParams) {
  const [isDispatchingNodeAlert, setIsDispatchingNodeAlert] = useState(false);
  const [isUpdatingNodeAlertLifecycle, setIsUpdatingNodeAlertLifecycle] = useState(false);

  const dispatchNodeRuleAlert = useCallback(
    async (alertID: string) => {
      if (!canWrite) {
        reportError("Your role does not allow alert dispatch.");
        return;
      }
      const alert = nodeRuleAlerts.find((item) => item.id === alertID);
      if (!alert) {
        reportError("Selected node alert no longer exists.");
        return;
      }

      setIsDispatchingNodeAlert(true);
      try {
        const response = await api.dispatchAlert({
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          source: "nodes-rule-engine",
          tags: ["nodes", alert.rule, alert.node],
        });
        if (response.success) {
          reportNotice("Node alert dispatched to configured channels.");
        } else {
          reportError("Node alert dispatch partially failed.");
        }
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to dispatch node alert");
      } finally {
        setIsDispatchingNodeAlert(false);
      }
    },
    [canWrite, nodeRuleAlerts, reportError, reportNotice],
  );

  const updateNodeAlertLifecycle = useCallback(
    async (alertID: string, status: "acknowledged" | "snoozed" | "dismissed" | "active") => {
      if (!canWrite) {
        reportError("Your role does not allow alert lifecycle updates.");
        return;
      }
      const alert = nodeRuleAlerts.find((item) => item.id === alertID);
      if (!alert) {
        reportError("Selected node alert no longer exists.");
        return;
      }

      let snoozeMinutes = 0;
      if (status === "snoozed") {
        const raw = window.prompt("Snooze duration in minutes (1-1440):", "30");
        if (raw === null) {
          return;
        }
        const parsed = Number.parseInt(raw.trim(), 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1440) {
          reportError("Invalid snooze duration. Enter a number between 1 and 1440.");
          return;
        }
        snoozeMinutes = parsed;
      }

      setIsUpdatingNodeAlertLifecycle(true);
      try {
        const updated = await api.updateAlertLifecycle({
          id: alert.id,
          node: alert.node,
          rule: alert.rule,
          status,
          snoozeMinutes: snoozeMinutes > 0 ? snoozeMinutes : undefined,
        });
        setAlertLifecycleByID((state) => ({
          ...state,
          [updated.id]: updated,
        }));
        reportNotice(
          status === "active"
            ? "Node alert moved back to active."
            : status === "acknowledged"
              ? "Node alert acknowledged."
              : status === "dismissed"
                ? "Node alert dismissed."
                : `Node alert snoozed for ${snoozeMinutes} minute(s).`,
        );
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to update node alert lifecycle");
      } finally {
        setIsUpdatingNodeAlertLifecycle(false);
      }
    },
    [canWrite, nodeRuleAlerts, reportError, reportNotice, setAlertLifecycleByID],
  );

  return {
    isDispatchingNodeAlert,
    isUpdatingNodeAlertLifecycle,
    dispatchNodeRuleAlert,
    updateNodeAlertLifecycle,
  };
}
