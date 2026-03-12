import type { PredictionsResult } from "../../types";

const API_PREFIX = "/api";

/**
 * Represents a failed API request with an attached HTTP status code.
 */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Builds a URL under the `/api` prefix from raw path fragments.
 *
 * @param segments - Unencoded path segments.
 * @returns API-relative path.
 */
export function apiPath(...segments: string[]): string {
  if (segments.length === 0) {
    return API_PREFIX;
  }
  // Callers must pass raw path fragments (not pre-encoded) to avoid double-encoding.
  return `${API_PREFIX}/${segments.map(encodeURIComponent).join("/")}`;
}

/**
 * Attempts to parse a response body as JSON.
 *
 * @param response - Fetch response object.
 * @returns Parsed JSON value or `null` when parsing fails.
 */
async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Performs a JSON request and parses a JSON response.
 *
 * @typeParam T - Expected JSON payload type.
 * @param url - Request URL.
 * @param init - Optional fetch init.
 * @returns Parsed response payload.
 * @throws {ApiError} When the response status is non-2xx.
 */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const payload = await parseJsonSafely(response);
    const message =
      typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;

    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

/**
 * Performs a request and returns the response body as plain text.
 *
 * @param url - Request URL.
 * @returns Response body.
 * @throws {ApiError} When the response status is non-2xx.
 */
export async function requestText(url: string): Promise<string> {
  const response = await fetch(url, {
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  return response.text();
}

/**
 * Loads predictions with backward-compatible fallback to legacy endpoint names.
 *
 * @param force - Whether to bypass server-side prediction caches.
 * @returns Prediction payload.
 */
export async function requestPredictions(force = false): Promise<PredictionsResult> {
  const suffix = force ? "?force=1" : "";
  try {
    return await requestJson<PredictionsResult>(`${apiPath("predictions")}${suffix}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Backward compatibility for pre-v0.2 backends; safe to remove after v1.0.
      return requestJson<PredictionsResult>(`${apiPath("predictive-incidents")}${suffix}`);
    }
    throw err;
  }
}

/**
 * Returns the SSE endpoint URL used for cluster event streams.
 */
export function buildStreamURL(): string {
  return apiPath("stream");
}

/**
 * Returns the WebSocket endpoint URL used for cluster event streams.
 */
export function buildStreamWSURL(): string {
  if (typeof window === "undefined") {
    return apiPath("stream", "ws");
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${apiPath("stream", "ws")}`;
}
