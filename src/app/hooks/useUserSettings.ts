import { useEffect, useState } from "react";

const SETTINGS_KEY = "k8s-ops.settings.v1";

export interface UserSettings {
  denseMode: boolean;
  autoRefreshSeconds: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  denseMode: false,
  autoRefreshSeconds: 30,
};

function loadSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      denseMode: parsed.denseMode ?? DEFAULT_SETTINGS.denseMode,
      autoRefreshSeconds: parsed.autoRefreshSeconds ?? DEFAULT_SETTINGS.autoRefreshSeconds,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(loadSettings);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  return { settings, setSettings };
}
