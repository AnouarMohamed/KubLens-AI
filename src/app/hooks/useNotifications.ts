import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { K8sEvent } from "../../types";

interface UseNotificationsInput {
  panel: "none" | "notifications" | "settings" | "profile";
  authLoading: boolean;
  canRead: boolean;
  canStream: boolean;
}

export function useNotifications({ panel, authLoading, canRead, canStream }: UseNotificationsInput) {
  const [notifications, setNotifications] = useState<K8sEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (panel !== "notifications") {
      return;
    }
    if (authLoading) {
      return;
    }
    if (!canRead) {
      setNotifications([]);
      setError("Authenticate first to access notifications.");
      return;
    }

    let cancelled = false;

    const loadSnapshot = () => {
      api
        .getEvents()
        .then((rows) => {
          if (!cancelled) {
            setNotifications(rows.slice(0, 14));
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load notifications");
          }
        });
    };

    if (canStream) {
      let socket: WebSocket | null = null;
      let reconnectTimer: number | null = null;
      let reconnectAttempt = 0;

      const scheduleReconnect = () => {
        if (cancelled) {
          return;
        }
        const delayMs = Math.min(30_000, 1_000 * 2 ** reconnectAttempt);
        reconnectAttempt = Math.min(reconnectAttempt + 1, 6);
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, delayMs);
      };

      const connect = () => {
        if (cancelled) {
          return;
        }

        try {
          socket = new WebSocket(api.getStreamWSURL());
        } catch {
          setError("Live stream unavailable. Retrying...");
          loadSnapshot();
          scheduleReconnect();
          return;
        }

        socket.onopen = () => {
          if (!cancelled) {
            reconnectAttempt = 0;
            setError(null);
          }
        };

        socket.onmessage = (event) => {
          if (cancelled) {
            return;
          }
          const payload = parseWSStreamPayload(event.data);
          if (!payload) {
            return;
          }
          if (payload.type === "cluster_events" && Array.isArray(payload.payload)) {
            setNotifications(payload.payload.slice(0, 14));
          }
          if (payload.type === "k8s_event" && payload.payload) {
            setNotifications((current) => [payload.payload as K8sEvent, ...current].slice(0, 14));
          }
        };

        socket.onerror = () => {
          if (!cancelled) {
            setError("Live stream disconnected. Retrying with snapshot fallback.");
          }
        };

        socket.onclose = () => {
          if (cancelled) {
            return;
          }
          setError("Live stream disconnected. Retrying with snapshot fallback.");
          loadSnapshot();
          scheduleReconnect();
        };
      };

      connect();
      return () => {
        cancelled = true;
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer);
        }
        socket?.close();
      };
    }

    loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [authLoading, canRead, canStream, panel]);

  return {
    notifications,
    notificationError: error,
  };
}

function parseWSStreamPayload<T>(data: string): { type: string; timestamp: string; payload: T } | null {
  try {
    return JSON.parse(data) as { type: string; timestamp: string; payload: T };
  } catch {
    return null;
  }
}
