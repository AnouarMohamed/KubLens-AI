/**
 * Utility side panels for notifications, settings, and user profile actions.
 */
import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { AuthSession, K8sEvent, RuntimeStatus } from "../../types";
import type { NotificationSignal, NotificationStatus } from "../hooks/useNotifications";
import { DEFAULT_SETTINGS, normalizeUserSettings, type UserSettings } from "../hooks/useUserSettings";

type Panel = "none" | "notifications" | "settings" | "profile";
type NotificationFilter = "all" | "warning" | "normal" | "other";
type NotificationSort = "newest" | "severity";

interface WorkspacePanelsProps {
  panel: Panel;
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
  settings: UserSettings;
  setSettings: Dispatch<SetStateAction<UserSettings>>;
  resetSettings: () => void;
  runtime: RuntimeStatus | null;
  authSession: AuthSession | null;
  authLoading: boolean;
  authToken: string;
  setAuthToken: (value: string) => void;
  authMessage: string | null;
  onAuthMessage: (value: string | null) => void;
  login: (token: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<AuthSession | null>;
  authLastRefreshAt: string | null;
  authLastLoginAt: string | null;
  authLastLogoutAt: string | null;
  authFailedLoginCount: number;
  currentCommand: string;
}

/**
 * Renders the active right-side utility panel.
 *
 * @param props - Panel state, notifications, auth session, and setting controls.
 * @returns Active panel element or `null`.
 */
export function WorkspacePanels({
  panel,
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
  settings,
  setSettings,
  resetSettings,
  runtime,
  authSession,
  authLoading,
  authToken,
  setAuthToken,
  authMessage,
  onAuthMessage,
  login,
  logout,
  refreshSession,
  authLastRefreshAt,
  authLastLoginAt,
  authLastLogoutAt,
  authFailedLoginCount,
  currentCommand,
}: WorkspacePanelsProps) {
  const [notificationQuery, setNotificationQuery] = useState("");
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>(
    settings.warningOnlyNotifications ? "warning" : "all",
  );
  const [notificationSort, setNotificationSort] = useState<NotificationSort>("newest");
  const [importedSettings, setImportedSettings] = useState("");
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [authTokenVisible, setAuthTokenVisible] = useState(false);
  const desktopNotificationsSupported = typeof window !== "undefined" && "Notification" in window;

  useEffect(() => {
    setNotificationFilter(settings.warningOnlyNotifications ? "warning" : "all");
  }, [settings.warningOnlyNotifications]);

  const panelWidthClass =
    settings.panelWidth === "xwide" ? "w-[42rem]" : settings.panelWidth === "wide" ? "w-[36rem]" : "w-[30rem]";

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

  const permissionSet = useMemo(() => new Set(authSession?.permissions ?? []), [authSession?.permissions]);

  if (panel === "none") {
    return null;
  }

  return (
    <aside
      className={`absolute top-20 right-4 z-40 h-[calc(100%-6rem)] max-w-[calc(100vw-2rem)] ${panelWidthClass} app-shell overflow-hidden`}
    >
      {panel === "notifications" && (
        <PanelShell title="Notifications" subtitle="Live cluster signals with triage controls">
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Unread"
              value={String(notificationUnreadCount)}
              tone={notificationUnreadCount > 0 ? "accent" : "muted"}
            />
            <StatTile label="Stored" value={String(notifications.length)} tone="muted" />
            <StatTile
              label="Warnings"
              value={String(summary.warning)}
              tone={summary.warning > 0 ? "warning" : "muted"}
            />
            <StatTile label="Normal" value={String(summary.normal)} tone={summary.normal > 0 ? "normal" : "muted"} />
            <StatTile
              label="Suppressed"
              value={String(notificationSuppressedCount)}
              tone={notificationSuppressedCount > 0 ? "warning" : "muted"}
            />
            <StatTile
              label="Burst risk"
              value={notificationSignal.burstDetected ? "High" : "Stable"}
              tone={notificationSignal.burstDetected ? "warning" : "normal"}
            />
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-300">
                Stream:{" "}
                <span className="font-semibold text-zinc-100">{notificationStatusLabel(notificationStatus)}</span>
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
      )}

      {panel === "settings" && (
        <PanelShell title="Settings" subtitle="Persistent workspace and notification controls">
          <section className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Workspace</p>
            <ToggleField
              label="Dense mode"
              value={settings.denseMode}
              onChange={(value) => setSettings((state) => ({ ...state, denseMode: value }))}
            />
            <ToggleField
              label="Relative timestamps"
              value={settings.relativeTimestamps}
              onChange={(value) => setSettings((state) => ({ ...state, relativeTimestamps: value }))}
            />
            <label className="block text-xs text-zinc-400">
              Auto logout on inactivity (minutes, 0 disables)
              <input
                type="number"
                min={0}
                max={240}
                value={settings.inactivityLogoutMinutes}
                onChange={(event) =>
                  setSettings((state) => ({
                    ...state,
                    inactivityLogoutMinutes: clampNumber(
                      event.target.value,
                      0,
                      240,
                      DEFAULT_SETTINGS.inactivityLogoutMinutes,
                    ),
                  }))
                }
                className="field mt-2 w-full"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Panel width
              <select
                value={settings.panelWidth}
                onChange={(event) =>
                  setSettings((state) => ({
                    ...state,
                    panelWidth: event.target.value as UserSettings["panelWidth"],
                  }))
                }
                className="field mt-2 w-full"
              >
                <option value="standard">Standard</option>
                <option value="wide">Wide</option>
                <option value="xwide">Extra wide</option>
              </select>
            </label>
          </section>

          <section className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Notifications</p>
            <label className="block text-xs text-zinc-400">
              Auto refresh fallback (seconds)
              <input
                type="number"
                min={10}
                max={300}
                value={settings.autoRefreshSeconds}
                onChange={(event) =>
                  setSettings((state) => ({
                    ...state,
                    autoRefreshSeconds: clampNumber(event.target.value, 10, 300, DEFAULT_SETTINGS.autoRefreshSeconds),
                  }))
                }
                className="field mt-2 w-full"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Stored event cap
              <input
                type="number"
                min={10}
                max={60}
                value={settings.notificationLimit}
                onChange={(event) =>
                  setSettings((state) => ({
                    ...state,
                    notificationLimit: clampNumber(event.target.value, 10, 60, DEFAULT_SETTINGS.notificationLimit),
                  }))
                }
                className="field mt-2 w-full"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Warning burst threshold (10m)
              <input
                type="number"
                min={3}
                max={50}
                value={settings.notificationBurstThreshold}
                onChange={(event) =>
                  setSettings((state) => ({
                    ...state,
                    notificationBurstThreshold: clampNumber(
                      event.target.value,
                      3,
                      50,
                      DEFAULT_SETTINGS.notificationBurstThreshold,
                    ),
                  }))
                }
                className="field mt-2 w-full"
              />
            </label>
            <ToggleField
              label="Use live stream when available"
              value={settings.liveNotifications}
              onChange={(value) => setSettings((state) => ({ ...state, liveNotifications: value }))}
            />
            <ToggleField
              label="Default to warning-only filter"
              value={settings.warningOnlyNotifications}
              onChange={(value) => setSettings((state) => ({ ...state, warningOnlyNotifications: value }))}
            />
            <label className="block text-xs text-zinc-400">
              Mute keywords (comma separated)
              <input
                type="text"
                value={settings.mutedNotificationKeywords.join(", ")}
                onChange={(event) =>
                  setSettings((state) => ({
                    ...state,
                    mutedNotificationKeywords: normalizeKeywordInput(event.target.value),
                  }))
                }
                placeholder="imagepullbackoff, probe, autoscaler"
                className="field mt-2 w-full"
              />
            </label>
            <ToggleField
              label="Redact sensitive values in notifications"
              value={settings.redactSensitiveNotifications}
              onChange={(value) => setSettings((state) => ({ ...state, redactSensitiveNotifications: value }))}
            />
            <ToggleField
              label="Desktop alerts for streamed events"
              value={settings.desktopNotifications}
              disabled={!desktopNotificationsSupported}
              onChange={(value) => setSettings((state) => ({ ...state, desktopNotifications: value }))}
            />
            {!desktopNotificationsSupported && (
              <p className="text-xs text-zinc-500">Desktop notifications are not supported in this browser.</p>
            )}
          </section>

          <section className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Portability</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  void copyText(JSON.stringify(settings, null, 2)).then(
                    () => setSettingsMessage("Settings copied to clipboard."),
                    () => setSettingsMessage("Unable to copy settings to clipboard."),
                  );
                }}
                className="btn-sm"
                type="button"
              >
                Export JSON
              </button>
              <button
                onClick={() => {
                  resetSettings();
                  setImportedSettings("");
                  setSettingsMessage("Settings reset to defaults.");
                }}
                className="btn-sm"
                type="button"
              >
                Reset defaults
              </button>
            </div>
            <label className="block text-xs text-zinc-400">
              Import JSON settings
              <textarea
                value={importedSettings}
                onChange={(event) => setImportedSettings(event.target.value)}
                placeholder='{"denseMode":true,"autoRefreshSeconds":45}'
                className="field mt-2 min-h-28 w-full resize-y py-2"
              />
            </label>
            <button
              onClick={() => {
                try {
                  const next = normalizeUserSettings(JSON.parse(importedSettings));
                  setSettings(next);
                  setSettingsMessage("Imported settings applied.");
                } catch {
                  setSettingsMessage("Invalid JSON payload.");
                }
              }}
              className="btn-sm"
              type="button"
            >
              Apply imported settings
            </button>
            {settingsMessage && <p className="text-xs text-zinc-400">{settingsMessage}</p>}
          </section>
        </PanelShell>
      )}

      {panel === "profile" && (
        <PanelShell title="Profile" subtitle="Identity, permissions, and runtime posture">
          <section className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-3 space-y-2">
            <InfoRow
              label="Session"
              value={authLoading ? "Checking..." : authSession?.authenticated ? "Authenticated" : "Not authenticated"}
            />
            <InfoRow label="Auth mode" value={authSession?.enabled ? "Token protected" : "Mode-based access"} />
            <InfoRow label="User" value={authSession?.user?.name ?? "N/A"} />
            <InfoRow label="Role" value={authSession?.user?.role ?? "N/A"} />
            <InfoRow label="Mode" value={runtime?.mode ?? "Unknown"} />
            <InfoRow
              label="Last auth refresh"
              value={authLastRefreshAt ? formatAbsoluteTime(authLastRefreshAt) : "N/A"}
            />
            <InfoRow label="Last login" value={authLastLoginAt ? formatAbsoluteTime(authLastLoginAt) : "N/A"} />
            <InfoRow label="Last logout" value={authLastLogoutAt ? formatAbsoluteTime(authLastLogoutAt) : "N/A"} />
            <InfoRow label="Failed login attempts" value={String(authFailedLoginCount)} />
          </section>

          <section className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Capabilities</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <CapabilityCell label="Read" enabled={permissionSet.has("read")} />
              <CapabilityCell label="Write" enabled={permissionSet.has("write")} />
              <CapabilityCell label="Assist" enabled={permissionSet.has("assist")} />
              <CapabilityCell label="Stream" enabled={permissionSet.has("stream")} />
            </div>
          </section>

          <section className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Runtime posture</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <StatusCell label="Write gate" ok={runtime?.writeActionsEnabled ?? false} />
              <StatusCell label="Predictor" ok={runtime?.predictorEnabled ? runtime.predictorHealthy : false} />
              <StatusCell label="Assistant" ok={runtime?.assistantEnabled ?? false} />
              <StatusCell label="RAG" ok={runtime?.ragEnabled ?? false} />
            </div>
            {runtime?.warnings?.length ? (
              <ul className="mt-2 space-y-1">
                {runtime.warnings.map((warning) => (
                  <li
                    key={warning}
                    className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-300"
                  >
                    {warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">No runtime warnings reported.</p>
            )}
          </section>

          <section className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Security diagnostics</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <StatusCell label="Secure context" ok={isSecureContextAvailable()} />
              <StatusCell label="Cookies enabled" ok={areCookiesEnabled()} />
              <StatusCell label="HTTPS" ok={isHTTPSContext()} />
              <StatusCell label="CSRF guard" ok={authSession?.enabled ?? false} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Cookie auth uses HttpOnly + SameSite=Strict and same-origin checks for mutating requests.
            </p>
          </section>

          <section className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-3 space-y-2">
            <label className="block text-xs text-zinc-400">
              Bearer token
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={authToken}
                  type={authTokenVisible ? "text" : "password"}
                  onChange={(event) => setAuthToken(event.target.value)}
                  placeholder="Paste API token"
                  className="field w-full"
                />
                <button onClick={() => setAuthTokenVisible((value) => !value)} className="btn-sm" type="button">
                  {authTokenVisible ? "Hide" : "Show"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Paste the raw token value. If you paste <code>Bearer &lt;token&gt;</code>, it will be normalized.
              </p>
            </label>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                onClick={async () => {
                  if (!authSession?.enabled) {
                    onAuthMessage("Auth is disabled in this environment. Sign-in is not required.");
                    return;
                  }
                  const sanitizedToken = sanitizeAuthTokenInput(authToken);
                  if (sanitizedToken === "") {
                    onAuthMessage("Token is required.");
                    return;
                  }
                  try {
                    const loginSession = await login(sanitizedToken);
                    const refreshed = await refreshSession();
                    const finalSession = refreshed ?? loginSession;
                    setAuthToken("");
                    if (finalSession.enabled && !finalSession.authenticated) {
                      onAuthMessage(
                        "Token was accepted but session is still unauthenticated. Check cookie policy and ensure UI/API share the same origin.",
                      );
                      return;
                    }
                    onAuthMessage(
                      finalSession.user?.name
                        ? `Session authenticated as ${finalSession.user.name}.`
                        : "Session authenticated.",
                    );
                  } catch (err) {
                    onAuthMessage(formatAuthErrorMessage(err));
                  }
                }}
                className="btn-sm"
                type="button"
                disabled={authLoading || authToken.trim() === ""}
              >
                Authenticate
              </button>
              <button
                onClick={async () => {
                  try {
                    await logout();
                    await refreshSession();
                    onAuthMessage("Session logged out.");
                  } catch (err) {
                    onAuthMessage(err instanceof Error ? err.message : "Logout failed");
                  }
                }}
                className="btn-sm"
                type="button"
                disabled={authLoading}
              >
                Logout
              </button>
              <button
                onClick={async () => {
                  try {
                    await refreshSession();
                    onAuthMessage("Session refreshed.");
                  } catch (err) {
                    onAuthMessage(err instanceof Error ? err.message : "Session refresh failed");
                  }
                }}
                className="btn-sm"
                type="button"
                disabled={authLoading}
              >
                Refresh session
              </button>
              <button
                onClick={() => {
                  void copyText(currentCommand).then(
                    () => onAuthMessage("Current command copied."),
                    () => onAuthMessage("Failed to copy command."),
                  );
                }}
                className="btn-sm"
                type="button"
              >
                Copy command
              </button>
              <button
                onClick={() => {
                  const snapshot = JSON.stringify(
                    {
                      timestamp: new Date().toISOString(),
                      auth: authSession,
                      runtime,
                    },
                    null,
                    2,
                  );
                  void copyText(snapshot).then(
                    () => onAuthMessage("Session snapshot copied."),
                    () => onAuthMessage("Unable to copy session snapshot."),
                  );
                }}
                className="btn-sm sm:col-span-2"
                type="button"
              >
                Copy profile snapshot
              </button>
            </div>
            {authMessage && <p className="text-xs text-zinc-400">{authMessage}</p>}
          </section>
        </PanelShell>
      )}
    </aside>
  );
}

function PanelShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-3 border-b border-zinc-700 bg-zinc-800/80">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "warning" | "normal" | "accent" | "muted";
}) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${statToneClass(tone)}`}>{value}</p>
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2">
      <span className="text-sm text-zinc-200">{label}</span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
    </label>
  );
}

function CapabilityCell({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xs font-semibold ${enabled ? "text-[var(--green)]" : "text-zinc-500"}`}>
        {enabled ? "enabled" : "disabled"}
      </p>
    </div>
  );
}

function StatusCell({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xs font-semibold ${ok ? "text-[var(--green)]" : "text-[var(--amber)]"}`}>
        {ok ? "healthy" : "attention"}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2">
      <span className="font-semibold text-zinc-100">{label}:</span> <span className="text-zinc-300">{value}</span>
    </p>
  );
}

function summarizeNotifications(events: K8sEvent[]): { warning: number; normal: number; other: number } {
  let warning = 0;
  let normal = 0;
  let other = 0;

  for (const event of events) {
    const tone = notificationTone(event.type);
    if (tone === "warning") {
      warning += 1;
      continue;
    }
    if (tone === "normal") {
      normal += 1;
      continue;
    }
    other += 1;
  }

  return { warning, normal, other };
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

function toneWeight(tone: "warning" | "normal" | "other"): number {
  if (tone === "warning") {
    return 3;
  }
  if (tone === "other") {
    return 2;
  }
  return 1;
}

function compareByTimestampDesc(a: K8sEvent, b: K8sEvent): number {
  const aTs = parseTimestamp(a.lastTimestamp);
  const bTs = parseTimestamp(b.lastTimestamp);
  return bTs - aTs;
}

function parseTimestamp(value?: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

function formatNotificationTime(event: K8sEvent, useRelative: boolean): string {
  if (!event.lastTimestamp) {
    return event.age || "unknown";
  }
  if (!useRelative) {
    return formatAbsoluteTime(event.lastTimestamp);
  }

  const parsed = Date.parse(event.lastTimestamp);
  if (Number.isNaN(parsed)) {
    return event.age || event.lastTimestamp;
  }

  const diffMs = parsed - Date.now();
  const diffSeconds = Math.round(diffMs / 1_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(diffSeconds) < 60) {
    return rtf.format(diffSeconds, "second");
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function formatAbsoluteTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function notificationBadgeClass(type: string): string {
  const tone = notificationTone(type);
  if (tone === "warning") {
    return "border-[var(--amber)]/45 bg-[var(--amber)]/14 text-zinc-100";
  }
  if (tone === "normal") {
    return "border-[var(--green)]/45 bg-[var(--green)]/14 text-zinc-100";
  }
  return "border-[var(--blue)]/45 bg-[var(--blue)]/14 text-zinc-100";
}

function statToneClass(tone: "warning" | "normal" | "accent" | "muted"): string {
  if (tone === "warning") {
    return "text-[var(--amber)]";
  }
  if (tone === "normal") {
    return "text-[var(--green)]";
  }
  if (tone === "accent") {
    return "text-[var(--accent)]";
  }
  return "text-zinc-100";
}

function notificationStatusDotClass(status: NotificationStatus): string {
  switch (status) {
    case "live":
      return "bg-[var(--green)]";
    case "reconnecting":
      return "bg-[var(--amber)]";
    case "blocked":
      return "bg-[var(--red)]";
    case "snapshot":
      return "bg-[var(--blue)]";
    default:
      return "bg-zinc-500";
  }
}

function notificationStatusLabel(status: NotificationStatus): string {
  switch (status) {
    case "live":
      return "Live";
    case "snapshot":
      return "Snapshot mode";
    case "reconnecting":
      return "Reconnecting";
    case "blocked":
      return "Blocked";
    default:
      return "Idle";
  }
}

function clampNumber(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function buildNotificationKey(event: K8sEvent): string {
  return [event.type, event.reason, event.from, event.message, event.lastTimestamp ?? event.age].join("|");
}

async function copyText(value: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return Promise.reject(new Error("clipboard unavailable"));
  }
  await navigator.clipboard.writeText(value);
}

function sanitizeAuthTokenInput(raw: string): string {
  const trimmed = raw.trim();
  const bearerPrefixPattern = /^bearer\s+/i;
  if (bearerPrefixPattern.test(trimmed)) {
    return trimmed.replace(bearerPrefixPattern, "").trim();
  }
  return trimmed;
}

function normalizeKeywordInput(raw: string): string[] {
  if (raw.trim() === "") {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(",")) {
    const normalized = token.trim().toLowerCase();
    if (normalized === "" || seen.has(normalized) || normalized.length > 64) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= 20) {
      break;
    }
  }
  return out;
}

function isSecureContextAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.isSecureContext;
}

function areCookiesEnabled(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return navigator.cookieEnabled;
}

function isHTTPSContext(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.protocol === "https:";
}

function formatAuthErrorMessage(err: unknown): string {
  if (isApiErrorLike(err) && err.status === 429) {
    return `${err.message} Wait before retrying to avoid lockout.`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Failed to authenticate";
}

function isApiErrorLike(value: unknown): value is { status: number; message: string } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { status?: unknown; message?: unknown };
  return typeof candidate.status === "number" && typeof candidate.message === "string";
}
