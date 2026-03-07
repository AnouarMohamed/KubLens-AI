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
      const source = new EventSource(api.getStreamURL());
      source.addEventListener("connected", () => {
        if (!cancelled) {
          setError(null);
        }
      });
      source.addEventListener("cluster_events", (event) => {
        if (!cancelled) {
          const payload = parseStreamPayload<K8sEvent[]>(event);
          if (payload?.payload) {
            setNotifications(payload.payload.slice(0, 14));
          }
        }
      });
      source.onerror = () => {
        if (!cancelled) {
          setError("Live stream disconnected. Showing snapshot.");
        }
        loadSnapshot();
      };

      return () => {
        cancelled = true;
        source.close();
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

function parseStreamPayload<T>(event: Event): { type: string; timestamp: string; payload: T } | null {
  try {
    if (!(event instanceof MessageEvent)) {
      return null;
    }
    return JSON.parse(event.data) as { type: string; timestamp: string; payload: T };
  } catch {
    return null;
  }
}
