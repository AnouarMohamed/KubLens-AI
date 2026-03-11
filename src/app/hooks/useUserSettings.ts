import { useEffect, useState } from "react";

const SETTINGS_KEY = "k8s-ops.settings.v1";

export type PanelWidth = "standard" | "wide" | "xwide";

export interface UserSettings {
  denseMode: boolean;
  autoRefreshSeconds: number;
  panelWidth: PanelWidth;
  relativeTimestamps: boolean;
  liveNotifications: boolean;
  notificationLimit: number;
  warningOnlyNotifications: boolean;
  desktopNotifications: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  denseMode: false,
  autoRefreshSeconds: 30,
  panelWidth: "standard",
  relativeTimestamps: true,
  liveNotifications: true,
  notificationLimit: 20,
  warningOnlyNotifications: false,
  desktopNotifications: false,
};

export function normalizeUserSettings(input: unknown): UserSettings {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const parsed = input as Partial<UserSettings>;
  return {
    denseMode: toBoolean(parsed.denseMode, DEFAULT_SETTINGS.denseMode),
    autoRefreshSeconds: toIntInRange(parsed.autoRefreshSeconds, 10, 300, DEFAULT_SETTINGS.autoRefreshSeconds),
    panelWidth: toPanelWidth(parsed.panelWidth),
    relativeTimestamps: toBoolean(parsed.relativeTimestamps, DEFAULT_SETTINGS.relativeTimestamps),
    liveNotifications: toBoolean(parsed.liveNotifications, DEFAULT_SETTINGS.liveNotifications),
    notificationLimit: toIntInRange(parsed.notificationLimit, 10, 60, DEFAULT_SETTINGS.notificationLimit),
    warningOnlyNotifications: toBoolean(parsed.warningOnlyNotifications, DEFAULT_SETTINGS.warningOnlyNotifications),
    desktopNotifications: toBoolean(parsed.desktopNotifications, DEFAULT_SETTINGS.desktopNotifications),
  };
}

function loadSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }

    return normalizeUserSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(loadSettings);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const resetSettings = () => setSettings({ ...DEFAULT_SETTINGS });

  return { settings, setSettings, resetSettings };
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toIntInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const integer = Math.trunc(value);
  if (integer < min) {
    return min;
  }
  if (integer > max) {
    return max;
  }
  return integer;
}

function toPanelWidth(value: unknown): PanelWidth {
  if (value === "standard" || value === "wide" || value === "xwide") {
    return value;
  }
  return DEFAULT_SETTINGS.panelWidth;
}
