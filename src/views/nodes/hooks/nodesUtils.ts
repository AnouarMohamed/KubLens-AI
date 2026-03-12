import type { NodeAlertLifecycle } from "../../../types";

export function indexAlertLifecycleByID(items: NodeAlertLifecycle[]): Record<string, NodeAlertLifecycle> {
  const out: Record<string, NodeAlertLifecycle> = {};
  for (const item of items) {
    out[item.id] = item;
  }
  return out;
}

export function parseCPUCapacity(raw: string): number {
  const value = raw.trim().toLowerCase();
  if (value === "") {
    return 0;
  }
  if (value.endsWith("m")) {
    const milli = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(milli) ? milli / 1000 : 0;
  }
  const cores = Number.parseFloat(value);
  return Number.isFinite(cores) ? cores : 0;
}

export function parseMemoryCapacity(raw: string): number {
  const value = raw.trim();
  if (value === "") {
    return 0;
  }

  const match = /^([0-9]+(?:\.[0-9]+)?)([KMGTE]i?)?$/i.exec(value);
  if (!match) {
    return 0;
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  const unit = (match[2] ?? "").toLowerCase();
  const multiplier =
    unit === "ki"
      ? 1024
      : unit === "mi"
        ? 1024 ** 2
        : unit === "gi"
          ? 1024 ** 3
          : unit === "ti"
            ? 1024 ** 4
            : unit === "ei"
              ? 1024 ** 6
              : unit === "k"
                ? 1000
                : unit === "m"
                  ? 1000 ** 2
                  : unit === "g"
                    ? 1000 ** 3
                    : unit === "t"
                      ? 1000 ** 4
                      : unit === "e"
                        ? 1000 ** 6
                        : 1;

  return amount * multiplier;
}

/**
 * Returns an operator-provided reason for force drain, or null if no valid reason was given.
 */
export function ensureForceDrainReason(target: string, initialReason?: string): string | null {
  const trimmed = (initialReason ?? "").trim();
  if (trimmed !== "") {
    return trimmed.slice(0, 240);
  }

  const input = window.prompt(`Force drain requires an audit reason for ${target}. Enter reason (max 240 chars):`, "");
  if (input === null) {
    return null;
  }

  const reason = input.trim();
  if (reason === "") {
    return null;
  }
  return reason.slice(0, 240);
}
