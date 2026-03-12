import { useEffect, useMemo, useState } from "react";
import type { K8sEvent } from "../../../types";
import type { NotificationSignal, NotificationStatus } from "../../hooks/useNotifications";
import type { UserSettings } from "../../hooks/useUserSettings";
import {
  buildNotificationKey,
  compareByTimestampDesc,
  copyText,
  formatAbsoluteTime,
  formatNotificationTime,
  notificationBadgeClass,
  notificationStatusDotClass,
  notificationStatusLabel,
  notificationTone,
  statToneClass,
  summarizeNotifications,
  toneWeight,
  topNotificationReasons,
} from "./helpers";
import type { NotificationFilter, NotificationSort } from "./types";
import { PanelShell, StatTile } from "./ui";

interface NotificationsPanelProps {
  notifications: K8sEvent[];
  notificationError: string | null;
  notificationStatus: NotificationStatus;
  notificationLastUpdatedAt: string | null;
  notificationUnreadCount: number;
  notificationSuppressedCount: number;
  notificationSignal: NotificationSignal;
  markNotificationsRead: () => void;
  clearNotifications: () => void;
  openEventsView: () => void;
  onAuthMessage: (value: string | null) => void;
  settings: UserSettings;
}

export function NotificationsPanel({
  notifications,
  notificationError,
  notificationStatus,
  notificationLastUpdatedAt,
  notificationUnreadCount,
  notificationSuppressedCount,
  notificationSignal,
  markNotificationsRead,
  clearNotifications,
  openEventsView,
  onAuthMessage,
  settings,
}: NotificationsPanelProps) {
  const [notificationQuery, setNotificationQuery] = useState("");
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>(
    settings.warningOnlyNotifications ? "warning" : "all",
  );
  const [notificationSort, setNotificationSort] = useState<NotificationSort>("newest");

  useEffect(() => {
    setNotificationFilter(settings.warningOnlyNotifications ? "warning" : "all");
  }, [settings.warningOnlyNotifications]);

  useEffect(() => {
    markNotificationsRead();
  }, [markNotificationsRead]);

  const summary = useMemo(() => summarizeNotifications(notifications), [notifications]);
  const filteredNotifications = useMemo(() => {
    const query = notificationQuery.trim().toLowerCase();
    const matches = notifications.filter((event) => {
      const tone = notificationTone(event.type);
      if (notificationFilter === "warning" && tone !== "warning") {
        return false;
      }
      if (notificationFilter === "normal" && tone !== "normal") {
        return false;
      }
      if (notificationFilter === "other" && tone !== "other") {
        return false;
      }
      if (query === "") {
        return true;
      }
      const haystack = `${event.reason} ${event.message} ${event.from} ${event.type}`.toLowerCase();
      return haystack.includes(query);
    });

    if (notificationSort === "severity") {
      matches.sort((a, b) => {
        const toneDelta = toneWeight(notificationTone(b.type)) - toneWeight(notificationTone(a.type));
        if (toneDelta !== 0) {
          return toneDelta;
        }
        return compareByTimestampDesc(a, b);
      });
    } else {
      matches.sort(compareByTimestampDesc);
    }

    return matches.slice(0, settings.notificationLimit);
  }, [notificationFilter, notificationQuery, notificationSort, notifications, settings.notificationLimit]);
  const topReasons = useMemo(() => topNotificationReasons(filteredNotifications, 3), [filteredNotifications]);

  return (
    <PanelShell title="Notifications" subtitle="Live cluster signals with triage controls">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Unread"
          value={String(notificationUnreadCount)}
          toneClass={statToneClass(notificationUnreadCount > 0 ? "accent" : "muted")}
        />
        <StatTile label="Stored" value={String(notifications.length)} toneClass={statToneClass("muted")} />
        <StatTile
          label="Warnings"
          value={String(summary.warning)}
          toneClass={statToneClass(summary.warning > 0 ? "warning" : "muted")}
        />
        <StatTile
          label="Normal"
          value={String(summary.normal)}
          toneClass={statToneClass(summary.normal > 0 ? "normal" : "muted")}
        />
        <StatTile
          label="Suppressed"
          value={String(notificationSuppressedCount)}
          toneClass={statToneClass(notificationSuppressedCount > 0 ? "warning" : "muted")}
        />
        <StatTile
          label="Burst risk"
          value={notificationSignal.burstDetected ? "High" : "Stable"}
          toneClass={statToneClass(notificationSignal.burstDetected ? "warning" : "normal")}
        />
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-300">
            Stream: <span className="font-semibold text-zinc-100">{notificationStatusLabel(notificationStatus)}</span>
          </p>
          <span className={`h-2 w-2 rounded-full ${notificationStatusDotClass(notificationStatus)}`} />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Last update: {notificationLastUpdatedAt ? formatAbsoluteTime(notificationLastUpdatedAt) : "N/A"}
        </p>
        <p className="text-xs text-zinc-500">Displaying up to {settings.notificationLimit} events</p>
        <p className="text-xs text-zinc-500">
          Velocity: {notificationSignal.totalLast5Minutes} events in 5m | {notificationSignal.warningLast10Minutes}{" "}
          warnings in 10m
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={notificationQuery}
          onChange={(event) => setNotificationQuery(event.target.value)}
          placeholder="Filter by reason, message, or source"
          className="field"
        />
        <select
          value={notificationFilter}
          onChange={(event) => setNotificationFilter(event.target.value as NotificationFilter)}
          className="field"
        >
          <option value="all">All events</option>
          <option value="warning">Warnings only</option>
          <option value="normal">Normal only</option>
          <option value="other">Other types</option>
        </select>
        <select
          value={notificationSort}
          onChange={(event) => setNotificationSort(event.target.value as NotificationSort)}
          className="field sm:col-span-2"
        >
          <option value="newest">Sort: Newest first</option>
          <option value="severity">Sort: Severity, then newest</option>
        </select>
      </div>

      {topReasons.length > 0 && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Top repeating reasons</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {topReasons.map((item) => (
              <span
                key={item.reason}
                className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
              >
                {item.reason} x{item.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={markNotificationsRead} className="btn-sm" type="button">
          Mark all read
        </button>
        <button onClick={clearNotifications} className="btn-sm" type="button">
          Clear cache
        </button>
        <button
          onClick={() => {
            void copyText(JSON.stringify(filteredNotifications, null, 2)).then(
              () => onAuthMessage("Filtered notifications copied."),
              () => onAuthMessage("Failed to copy notifications."),
            );
          }}
          className="btn-sm"
          type="button"
        >
          Export filtered
        </button>
        <button onClick={openEventsView} className="btn-sm" type="button">
          Open events view
        </button>
      </div>

      {notificationSignal.burstDetected && (
        <div className="rounded-xl border border-[var(--amber)]/45 bg-[var(--amber)]/10 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-[var(--amber)]">Operational signal</p>
          <p className="mt-1 text-sm text-zinc-100">
            Warning burst detected. Prioritize events with repeated reasons and open incident workflow if trend
            persists.
          </p>
        </div>
      )}

      {notificationError && <p className="text-sm text-zinc-200">{notificationError}</p>}

      {filteredNotifications.map((event, index) => (
        <article
          key={`${buildNotificationKey(event)}-${index}`}
          className="rounded-xl border border-zinc-700 bg-zinc-800/70 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-zinc-100">{event.reason || "Cluster event"}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {formatNotificationTime(event, settings.relativeTimestamps)} | {event.from || "unknown source"}
              </p>
            </div>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] uppercase ${notificationBadgeClass(event.type)}`}
            >
              {event.type || "event"}
            </span>
          </div>
          <p className="text-xs text-zinc-300 mt-2 leading-relaxed whitespace-pre-wrap">
            {event.message || "No message"}
          </p>
          {(event.count ?? 0) > 1 && (
            <p className="mt-2 text-xs text-zinc-500">
              Repeated <span className="text-zinc-300">{event.count}</span> times
            </p>
          )}
        </article>
      ))}

      {!notificationError && filteredNotifications.length === 0 && (
        <p className="text-sm text-zinc-400">No notifications match your current filters.</p>
      )}
    </PanelShell>
  );
}
