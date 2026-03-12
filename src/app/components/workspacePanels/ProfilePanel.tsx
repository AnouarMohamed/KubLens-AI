import { useMemo, useState } from "react";
import type { AuthSession, RuntimeStatus } from "../../../types";
import {
  areCookiesEnabled,
  copyText,
  formatAbsoluteTime,
  formatAuthErrorMessage,
  isHTTPSContext,
  isSecureContextAvailable,
  sanitizeAuthTokenInput,
} from "./helpers";
import { CapabilityCell, InfoRow, PanelShell, StatusCell } from "./ui";

interface ProfilePanelProps {
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

export function ProfilePanel({
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
}: ProfilePanelProps) {
  const [authTokenVisible, setAuthTokenVisible] = useState(false);
  const permissionSet = useMemo(() => new Set(authSession?.permissions ?? []), [authSession?.permissions]);

  return (
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
        <InfoRow label="Last auth refresh" value={authLastRefreshAt ? formatAbsoluteTime(authLastRefreshAt) : "N/A"} />
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
  );
}
