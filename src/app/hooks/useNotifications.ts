import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { api } from "../../lib/api";
import type { K8sEvent } from "../../types";

type Panel = "none" | "notifications" | "settings" | "profile";

export type NotificationStatus = "idle" | "live" | "snapshot" | "reconnecting" | "blocked";
export interface NotificationSignal {
  totalLast5Minutes: number;
  warningLast10Minutes: number;
  burstDetected: boolean;
}

interface UseNotificationsInput {
  panel: Panel;
  authLoading: boolean;
  canRead: boolean;
  canStream: boolean;
  autoRefreshSeconds: number;
  notificationLimit: number;
  notificationBurstThreshold: number;
  liveNotificationsEnabled: boolean;
  desktopNotificationsEnabled: boolean;
  mutedKeywords: string[];
  redactSensitiveNotifications: boolean;
}

export function useNotifications({
  panel,
  authLoading,
  canRead,
  canStream,
  autoRefreshSeconds,
  notificationLimit,
  notificationBurstThreshold,
  liveNotificationsEnabled,
  desktopNotificationsEnabled,
  mutedKeywords,
  redactSensitiveNotifications,
}: UseNotificationsInput) {
  const [notifications, setNotifications] = useState<K8sEvent[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>("idle");
  const [notificationLastUpdatedAt, setNotificationLastUpdatedAt] = useState<string | null>(null);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationSuppressedCount, setNotificationSuppressedCount] = useState(0);
  const [notificationSignal, setNotificationSignal] = useState<NotificationSignal>({
    totalLast5Minutes: 0,
    warningLast10Minutes: 0,
    burstDetected: false,
  });
  const mutedKeywordsSignature = mutedKeywords
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword !== "")
    .join("|");
  const mutedKeywordSet = useMemo(() => keywordSetFromSignature(mutedKeywordsSignature), [mutedKeywordsSignature]);

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
    setNotificationSuppressedCount(0);
    setNotificationSignal({
      totalLast5Minutes: 0,
      warningLast10Minutes: 0,
      burstDetected: false,
    });
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

      const visibleRows: K8sEvent[] = [];
      let suppressed = 0;
      for (const row of rows) {
        if (matchesMutedKeyword(row, mutedKeywordSet)) {
          suppressed += 1;
          continue;
        }
        visibleRows.push(redactSensitiveNotifications ? redactEventFields(row) : row);
      }
      if (suppressed > 0) {
        setNotificationSuppressedCount((current) => current + suppressed);
      }
      if (visibleRows.length === 0) {
        return;
      }

      setNotifications((current) => {
        const merged = mode === "replace" ? visibleRows : [...visibleRows, ...current];
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
        setNotificationSignal(deriveNotificationSignal(deduped, notificationBurstThreshold));
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
    mutedKeywordSet,
    notificationBurstThreshold,
    notificationLimit,
    redactSensitiveNotifications,
  ]);

  return {
    notifications,
    notificationError,
    notificationStatus,
    notificationLastUpdatedAt,
    notificationUnreadCount,
    notificationSuppressedCount,
    notificationSignal,
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

function normalizeMutedKeywords(keywords: string[]): Set<string> {
  const out = new Set<string>();
  for (const keyword of keywords) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized !== "") {
      out.add(normalized);
    }
  }
  return out;
}

function keywordSetFromSignature(signature: string): Set<string> {
  if (signature.trim() === "") {
    return new Set<string>();
  }
  return normalizeMutedKeywords(signature.split("|"));
}

function matchesMutedKeyword(event: K8sEvent, mutedKeywords: Set<string>): boolean {
  if (mutedKeywords.size === 0) {
    return false;
  }
  const haystack = `${event.reason} ${event.message} ${event.from} ${event.type}`.toLowerCase();
  for (const keyword of mutedKeywords) {
    if (haystack.includes(keyword)) {
      return true;
    }
  }
  return false;
}

function redactEventFields(event: K8sEvent): K8sEvent {
  return {
    ...event,
    reason: redactSensitiveText(event.reason),
    message: redactSensitiveText(event.message),
    from: redactSensitiveText(event.from),
  };
}

function redactSensitiveText(value: string): string {
  if (!value) {
    return value;
  }

  let redacted = value;
  redacted = redacted.replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]");
  redacted = redacted.replace(/((?:token|password|secret|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]");
  redacted = redacted.replace(/\b[A-Za-z0-9+/_-]{24,}\b/g, "[redacted]");
  return redacted;
}

function deriveNotificationSignal(events: K8sEvent[], burstThreshold: number): NotificationSignal {
  const now = Date.now();
  let totalLast5Minutes = 0;
  let warningLast10Minutes = 0;

  for (const event of events) {
    const timestamp = parseTimestampMs(event.lastTimestamp);
    if (timestamp === 0) {
      continue;
    }
    const ageMs = now - timestamp;
    if (ageMs <= 5 * 60 * 1000) {
      totalLast5Minutes += 1;
    }
    if (ageMs <= 10 * 60 * 1000 && notificationTone(event.type) === "warning") {
      warningLast10Minutes += 1;
    }
  }

  const threshold = Math.max(3, burstThreshold);
  return {
    totalLast5Minutes,
    warningLast10Minutes,
    burstDetected: warningLast10Minutes >= threshold,
  };
}

function notificationTone(type: string): "warning" | "normal" | "other" {
  const normalized = type.trim().toLowerCase();
  if (normalized === "warning") {
    return "warning";
  }
  if (normalized === "normal") {
    return "normal";
  }
  return "other";
}

function parseTimestampMs(value?: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}
