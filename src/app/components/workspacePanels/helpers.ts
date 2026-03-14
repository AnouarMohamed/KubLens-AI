import type { K8sEvent } from "../../../types";
import type { NotificationStatus } from "../../hooks/useNotifications";

export function summarizeNotifications(events: K8sEvent[]): { warning: number; normal: number; other: number } {
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

export function topNotificationReasons(events: K8sEvent[], take = 3): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = (event.reason ?? "").trim();
    if (key === "") {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, Math.max(1, take))
    .map(([reason, count]) => ({ reason, count }));
}

export function notificationTone(type?: string | null): "warning" | "normal" | "other" {
  const normalized = (type ?? "").trim().toLowerCase();
  if (normalized === "warning") {
    return "warning";
  }
  if (normalized === "normal") {
    return "normal";
  }
  return "other";
}

export function toneWeight(tone: "warning" | "normal" | "other"): number {
  if (tone === "warning") {
    return 3;
  }
  if (tone === "other") {
    return 2;
  }
  return 1;
}

export function compareByTimestampDesc(a: K8sEvent, b: K8sEvent): number {
  const aTs = parseTimestamp(a.lastTimestamp);
  const bTs = parseTimestamp(b.lastTimestamp);
  return bTs - aTs;
}

export function formatNotificationTime(event: K8sEvent, useRelative: boolean): string {
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

export function formatAbsoluteTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function notificationBadgeClass(type?: string | null): string {
  const tone = notificationTone(type);
  if (tone === "warning") {
    return "border-[var(--amber)]/45 bg-[var(--amber)]/14 text-zinc-100";
  }
  if (tone === "normal") {
    return "border-[var(--green)]/45 bg-[var(--green)]/14 text-zinc-100";
  }
  return "border-[var(--blue)]/45 bg-[var(--blue)]/14 text-zinc-100";
}

export function statToneClass(tone: "warning" | "normal" | "accent" | "muted"): string {
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

export function notificationStatusDotClass(status: NotificationStatus): string {
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

export function notificationStatusLabel(status: NotificationStatus): string {
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

export function clampNumber(raw: string, min: number, max: number, fallback: number): number {
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

export function buildNotificationKey(event: K8sEvent): string {
  return [event.type, event.reason, event.from, event.message, event.lastTimestamp ?? event.age].join("|");
}

export async function copyText(value: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return Promise.reject(new Error("clipboard unavailable"));
  }
  await navigator.clipboard.writeText(value);
}

export function sanitizeAuthTokenInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return "";
  }
  const bearerPrefixPattern = /^bearer(?:\s+|$)/i;
  if (bearerPrefixPattern.test(trimmed)) {
    return trimmed.replace(bearerPrefixPattern, "").trim();
  }
  return trimmed;
}

export function normalizeKeywordInput(raw: string): string[] {
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

export function isSecureContextAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.isSecureContext;
}

export function areCookiesEnabled(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return navigator.cookieEnabled;
}

export function isHTTPSContext(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.protocol === "https:";
}

export function formatAuthErrorMessage(err: unknown): string {
  if (isApiErrorLike(err) && err.status === 429) {
    return `${err.message} Wait before retrying to avoid lockout.`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Failed to authenticate";
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

function isApiErrorLike(value: unknown): value is { status: number; message: string } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { status?: unknown; message?: unknown };
  return typeof candidate.status === "number" && typeof candidate.message === "string";
}
