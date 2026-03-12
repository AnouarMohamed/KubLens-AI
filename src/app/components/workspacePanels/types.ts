import type { Dispatch, SetStateAction } from "react";
import type { AuthSession, K8sEvent, RuntimeStatus } from "../../../types";
import type { NotificationSignal, NotificationStatus } from "../../hooks/useNotifications";
import type { UserSettings } from "../../hooks/useUserSettings";

export type Panel = "none" | "notifications" | "settings" | "profile";
export type NotificationFilter = "all" | "warning" | "normal" | "other";
export type NotificationSort = "newest" | "severity";

export interface WorkspacePanelsProps {
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
