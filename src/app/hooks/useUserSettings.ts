import { useEffect, useState } from "react";

const SETTINGS_KEY = "k8s-ops.settings.v1";

export type PanelWidth = "standard" | "wide" | "xwide";

export interface UserSettings {
  denseMode: boolean;
  autoRefreshSeconds: number;
  panelWidth: PanelWidth;
  relativeTimestamps: boolean;
  inactivityLogoutMinutes: number;
  liveNotifications: boolean;
  notificationLimit: number;
  notificationBurstThreshold: number;
  warningOnlyNotifications: boolean;
  mutedNotificationKeywords: string[];
  redactSensitiveNotifications: boolean;
  desktopNotifications: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  denseMode: false,
  autoRefreshSeconds: 30,
  panelWidth: "standard",
  relativeTimestamps: true,
  inactivityLogoutMinutes: 0,
  liveNotifications: true,
  notificationLimit: 20,
  notificationBurstThreshold: 8,
  warningOnlyNotifications: false,
  mutedNotificationKeywords: [],
  redactSensitiveNotifications: true,
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
    inactivityLogoutMinutes: toIntInRange(
      parsed.inactivityLogoutMinutes,
      0,
      240,
      DEFAULT_SETTINGS.inactivityLogoutMinutes,
    ),
    liveNotifications: toBoolean(parsed.liveNotifications, DEFAULT_SETTINGS.liveNotifications),
    notificationLimit: toIntInRange(parsed.notificationLimit, 10, 60, DEFAULT_SETTINGS.notificationLimit),
    notificationBurstThreshold: toIntInRange(
      parsed.notificationBurstThreshold,
      3,
      50,
      DEFAULT_SETTINGS.notificationBurstThreshold,
    ),
    warningOnlyNotifications: toBoolean(parsed.warningOnlyNotifications, DEFAULT_SETTINGS.warningOnlyNotifications),
    mutedNotificationKeywords: normalizeMutedKeywords(parsed.mutedNotificationKeywords),
    redactSensitiveNotifications: toBoolean(
      parsed.redactSensitiveNotifications,
      DEFAULT_SETTINGS.redactSensitiveNotifications,
    ),
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

function normalizeMutedKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SETTINGS.mutedNotificationKeywords];
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const normalized = item.trim().toLowerCase();
    if (normalized === "" || normalized.length > 64 || seen.has(normalized)) {
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
