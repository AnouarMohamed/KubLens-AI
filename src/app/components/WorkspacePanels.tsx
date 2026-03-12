/**
 * Utility side panels for notifications, settings, and user profile actions.
 */
import { NotificationsPanel } from "./workspacePanels/NotificationsPanel";
import { ProfilePanel } from "./workspacePanels/ProfilePanel";
import { SettingsPanel } from "./workspacePanels/SettingsPanel";
import type { WorkspacePanelsProps } from "./workspacePanels/types";

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
  if (panel === "none") {
    return null;
  }

  const panelWidthClass =
    settings.panelWidth === "xwide" ? "w-[42rem]" : settings.panelWidth === "wide" ? "w-[36rem]" : "w-[30rem]";

  return (
    <aside
      className={`absolute top-20 right-4 z-40 h-[calc(100%-6rem)] max-w-[calc(100vw-2rem)] ${panelWidthClass} app-shell overflow-hidden`}
    >
      {panel === "notifications" && (
        <NotificationsPanel
          notifications={notifications}
          notificationError={notificationError}
          notificationStatus={notificationStatus}
          notificationLastUpdatedAt={notificationLastUpdatedAt}
          notificationUnreadCount={notificationUnreadCount}
          notificationSuppressedCount={notificationSuppressedCount}
          notificationSignal={notificationSignal}
          markNotificationsRead={markNotificationsRead}
          clearNotifications={clearNotifications}
          openEventsView={openEventsView}
          onAuthMessage={onAuthMessage}
          settings={settings}
        />
      )}

      {panel === "settings" && (
        <SettingsPanel settings={settings} setSettings={setSettings} resetSettings={resetSettings} />
      )}

      {panel === "profile" && (
        <ProfilePanel
          runtime={runtime}
          authSession={authSession}
          authLoading={authLoading}
          authToken={authToken}
          setAuthToken={setAuthToken}
          authMessage={authMessage}
          onAuthMessage={onAuthMessage}
          login={login}
          logout={logout}
          refreshSession={refreshSession}
          authLastRefreshAt={authLastRefreshAt}
          authLastLoginAt={authLastLoginAt}
          authLastLogoutAt={authLastLogoutAt}
          authFailedLoginCount={authFailedLoginCount}
          currentCommand={currentCommand}
        />
      )}
    </aside>
  );
}
