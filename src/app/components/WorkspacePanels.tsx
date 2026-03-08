import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { AuthSession, K8sEvent } from "../../types";
import type { UserSettings } from "../hooks/useUserSettings";

type Panel = "none" | "notifications" | "settings" | "profile";

interface WorkspacePanelsProps {
  panel: Panel;
  notifications: K8sEvent[];
  notificationError: string | null;
  settings: UserSettings;
  setSettings: Dispatch<SetStateAction<UserSettings>>;
  authSession: AuthSession | null;
  authLoading: boolean;
  authToken: string;
  setAuthToken: (value: string) => void;
  authMessage: string | null;
  onAuthMessage: (value: string | null) => void;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  currentCommand: string;
}

export function WorkspacePanels({
  panel,
  notifications,
  notificationError,
  settings,
  setSettings,
  authSession,
  authLoading,
  authToken,
  setAuthToken,
  authMessage,
  onAuthMessage,
  login,
  logout,
  refreshSession,
  currentCommand,
}: WorkspacePanelsProps) {
  if (panel === "none") {
    return null;
  }

  return (
    <aside className="absolute top-20 right-4 z-40 h-[calc(100%-6rem)] w-[30rem] app-shell overflow-hidden">
      {panel === "notifications" && (
        <PanelShell title="Notifications" subtitle="Event stream from cluster activity">
          {notificationError && <p className="text-sm text-zinc-200">{notificationError}</p>}
          {notifications.map((event, index) => (
            <article key={`${event.reason}-${index}`} className="rounded-xl border border-zinc-700 bg-zinc-800/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-100">{event.reason}</p>
                <p className="text-xs text-zinc-400">{event.age}</p>
              </div>
              <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{event.message}</p>
            </article>
          ))}
          {!notificationError && notifications.length === 0 && (
            <p className="text-sm text-zinc-400">No notifications available.</p>
          )}
        </PanelShell>
      )}

      {panel === "settings" && (
        <PanelShell title="Settings" subtitle="Workspace behavior and density">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
            <span>Dense mode</span>
            <input
              type="checkbox"
              checked={settings.denseMode}
              onChange={(event) => setSettings((state) => ({ ...state, denseMode: event.target.checked }))}
            />
          </label>
          <label className="block rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
            Auto refresh (seconds)
            <input
              type="number"
              min={10}
              max={300}
              value={settings.autoRefreshSeconds}
              onChange={(event) =>
                setSettings((state) => ({
                  ...state,
                  autoRefreshSeconds: Number.parseInt(event.target.value, 10) || 30,
                }))
              }
              className="mt-2 h-10 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 text-sm text-zinc-100"
            />
          </label>
        </PanelShell>
      )}

      {panel === "profile" && (
        <PanelShell title="Profile" subtitle="Current operator identity">
          <InfoRow label="Auth Mode" value={authSession?.enabled ? "Token protected" : "Mode-based access"} />
          <InfoRow
            label="Session"
            value={authLoading ? "Checking..." : authSession?.authenticated ? "Authenticated" : "Not authenticated"}
          />
          <InfoRow label="User" value={authSession?.user?.name ?? "N/A"} />
          <InfoRow label="Role" value={authSession?.user?.role ?? "N/A"} />
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
            <p className="text-xs text-zinc-400">Permissions</p>
            <p className="mt-1 text-sm text-zinc-200">{authSession?.permissions?.join(", ") || "none"}</p>
          </div>
          <label className="block rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
            Bearer token
            <input
              value={authToken}
              onChange={(event) => setAuthToken(event.target.value)}
              placeholder="Paste API token"
              className="mt-2 h-10 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 text-sm text-zinc-100"
            />
          </label>
          <button
            onClick={async () => {
              try {
                await login(authToken);
                await refreshSession();
                setAuthToken("");
                onAuthMessage("Session authenticated.");
              } catch (err) {
                onAuthMessage(err instanceof Error ? err.message : "Failed to authenticate");
              }
            }}
            className="rounded-xl border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
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
            className="rounded-xl border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Logout
          </button>
          {authMessage && <p className="text-xs text-zinc-400">{authMessage}</p>}
          <button
            onClick={() => navigator.clipboard.writeText(currentCommand)}
            className="rounded-xl border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Copy Current Command
          </button>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
      <span className="font-semibold text-zinc-100">{label}:</span> <span className="text-zinc-300">{value}</span>
    </p>
  );
}
