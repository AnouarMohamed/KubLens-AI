import { useState, type Dispatch, type SetStateAction } from "react";
import { DEFAULT_SETTINGS, normalizeUserSettings, type UserSettings } from "../../hooks/useUserSettings";
import { clampNumber, copyText, normalizeKeywordInput } from "./helpers";
import { PanelShell, ToggleField } from "./ui";

interface SettingsPanelProps {
  settings: UserSettings;
  setSettings: Dispatch<SetStateAction<UserSettings>>;
  resetSettings: () => void;
}

export function SettingsPanel({ settings, setSettings, resetSettings }: SettingsPanelProps) {
  const [importedSettings, setImportedSettings] = useState("");
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const desktopNotificationsSupported = typeof window !== "undefined" && "Notification" in window;

  return (
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
  );
}
