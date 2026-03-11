import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { api } from "../../lib/api";
import type { K8sEvent } from "../../types";

type Panel = "none" | "notifications" | "settings" | "profile";

export type NotificationStatus = "idle" | "live" | "snapshot" | "reconnecting" | "blocked";

interface UseNotificationsInput {
  panel: Panel;
  authLoading: boolean;
  canRead: boolean;
  canStream: boolean;
  autoRefreshSeconds: number;
  notificationLimit: number;
  liveNotificationsEnabled: boolean;
  desktopNotificationsEnabled: boolean;
}

export function useNotifications({
  panel,
  authLoading,
  canRead,
  canStream,
  autoRefreshSeconds,
  notificationLimit,
  liveNotificationsEnabled,
  desktopNotificationsEnabled,
}: UseNotificationsInput) {
  const [notifications, setNotifications] = useState<K8sEvent[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>("idle");
  const [notificationLastUpdatedAt, setNotificationLastUpdatedAt] = useState<string | null>(null);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);

  const knownKeysRef = useRef<Set<string>>(new Set());
  const unreadKeysRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const permissionRequestedRef = useRef(false);
  const panelRef = useRef(panel);

  const markNotificationsRead = useCallback(() => {
    unreadKeysRef.current.clear();
    setNotificationUnreadCount(0);
  }, []);

  const clearNotifications = useCallback(() => {
    knownKeysRef.current.clear();
    unreadKeysRef.current.clear();
    initializedRef.current = false;
    setNotifications([]);
    setNotificationUnreadCount(0);
    setNotificationLastUpdatedAt(null);
    setNotificationError(null);
  }, []);

  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);

  useEffect(() => {
    if (panel !== "notifications") {
      return;
    }
    markNotificationsRead();
  }, [markNotificationsRead, panel]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!canRead) {
      clearNotifications();
      setNotificationStatus("blocked");
      setNotificationError("Authenticate first to access notifications.");
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;
    let refreshTimer: number | null = null;
    let socket: WebSocket | null = null;
    let reconnectAttempt = 0;

    const trimLimit = Math.max(10, Math.min(notificationLimit, 60));

    const ingestEvents = (
      rows: K8sEvent[],
      mode: "replace" | "prepend",
      source: "snapshot" | "stream",
      emittedAt?: string,
    ) => {
      if (cancelled || rows.length === 0) {
        return;
      }

      setNotifications((current) => {
        const merged = mode === "replace" ? rows : [...rows, ...current];
        const deduped: K8sEvent[] = [];
        const dedupeSeen = new Set<string>();

        for (const event of merged) {
          const key = buildEventKey(event);
          if (dedupeSeen.has(key)) {
            continue;
          }
          dedupeSeen.add(key);
          deduped.push(event);
          if (deduped.length >= trimLimit) {
            break;
          }
        }

        for (const event of deduped) {
          const key = buildEventKey(event);
          const isNew = !knownKeysRef.current.has(key);
          if (isNew) {
            knownKeysRef.current.add(key);
          }
          if (isNew && initializedRef.current && panelRef.current !== "notifications") {
            unreadKeysRef.current.add(key);
            if (source === "stream" && desktopNotificationsEnabled) {
              maybeSendDesktopNotification(event, permissionRequestedRef);
            }
          }
        }

        if (!initializedRef.current && deduped.length > 0) {
          initializedRef.current = true;
        }
        if (panelRef.current === "notifications") {
          unreadKeysRef.current.clear();
        }
        setNotificationUnreadCount(unreadKeysRef.current.size);
        return deduped;
      });

      setNotificationLastUpdatedAt(emittedAt ?? new Date().toISOString());
    };

    const loadSnapshot = () => {
      api
        .getEvents()
        .then((rows) => {
          if (!cancelled) {
            ingestEvents(rows, "replace", "snapshot");
            setNotificationStatus((current) => (current === "live" ? current : "snapshot"));
            setNotificationError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setNotificationError(err instanceof Error ? err.message : "Failed to load notifications");
            setNotificationStatus((current) => (current === "idle" ? "snapshot" : current));
          }
        });
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== null) {
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
        setNotificationStatus("reconnecting");
        setNotificationError("Live stream unavailable. Retrying with snapshot fallback.");
        loadSnapshot();
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (cancelled) {
          return;
        }
        reconnectAttempt = 0;
        setNotificationStatus("live");
        setNotificationError(null);
      };

      socket.onmessage = (event) => {
        if (cancelled) {
          return;
        }
        const payload = parseWSStreamPayload<K8sEvent[] | K8sEvent>(event.data);
        if (!payload) {
          return;
        }
        if (payload.type === "cluster_events" && Array.isArray(payload.payload)) {
          ingestEvents(payload.payload, "replace", "stream", payload.timestamp);
          return;
        }
        if (payload.type === "k8s_event" && payload.payload && !Array.isArray(payload.payload)) {
          ingestEvents([payload.payload], "prepend", "stream", payload.timestamp);
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          setNotificationStatus("reconnecting");
          setNotificationError("Live stream disrupted. Retrying with snapshot fallback.");
        }
      };

      socket.onclose = () => {
        if (cancelled) {
          return;
        }
        setNotificationStatus("reconnecting");
        setNotificationError("Live stream disconnected. Retrying with snapshot fallback.");
        loadSnapshot();
        scheduleReconnect();
      };
    };

    if (canStream && liveNotificationsEnabled) {
      setNotificationStatus("reconnecting");
      loadSnapshot();
      connect();
    } else {
      setNotificationStatus("snapshot");
      loadSnapshot();
      refreshTimer = window.setInterval(loadSnapshot, Math.max(10, autoRefreshSeconds) * 1_000);
    }

    return () => {
      cancelled = true;
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer);
      }
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [
    authLoading,
    autoRefreshSeconds,
    canRead,
    canStream,
    clearNotifications,
    desktopNotificationsEnabled,
    liveNotificationsEnabled,
    notificationLimit,
  ]);

  return {
    notifications,
    notificationError,
    notificationStatus,
    notificationLastUpdatedAt,
    notificationUnreadCount,
    markNotificationsRead,
    clearNotifications,
  };
}

function parseWSStreamPayload<T>(data: string): { type: string; timestamp: string; payload: T } | null {
  try {
    return JSON.parse(data) as { type: string; timestamp: string; payload: T };
  } catch {
    return null;
  }
}

function buildEventKey(event: K8sEvent): string {
  return [
    event.type ?? "",
    event.reason ?? "",
    event.from ?? "",
    event.message ?? "",
    event.lastTimestamp ?? event.age ?? "",
  ].join("|");
}

function maybeSendDesktopNotification(event: K8sEvent, permissionRequestedRef: MutableRefObject<boolean>): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return;
  }

  if (Notification.permission === "granted") {
    const title = event.reason ? `KubeLens: ${event.reason}` : "KubeLens event";
    const body = event.message ? event.message.slice(0, 180) : "Cluster event received.";
    // Browser-level notifications are best effort; errors are intentionally ignored.
    try {
      new Notification(title, { body });
    } catch {
      // no-op
    }
    return;
  }

  if (Notification.permission === "default" && !permissionRequestedRef.current) {
    permissionRequestedRef.current = true;
    void Notification.requestPermission();
  }
}
