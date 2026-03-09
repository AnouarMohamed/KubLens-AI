import { useEffect } from "react";
import { api } from "../../lib/api";
import type { StreamEvent } from "../../types";

interface UseStreamRefreshOptions<T = unknown> {
  enabled: boolean;
  eventTypes: string[];
  onEvent: (event: StreamEvent<T>) => void;
}

export function useStreamRefresh<T>({ enabled, eventTypes, onEvent }: UseStreamRefreshOptions<T>) {
  useEffect(() => {
    if (!enabled || eventTypes.length === 0) {
      return;
    }

    let cancelled = false;
    const url = typeof api.getStreamWSURL === "function" ? api.getStreamWSURL() : "";
    if (!url) {
      return;
    }

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(url);
    } catch {
      return;
    }

    socket.onmessage = (event) => {
      if (cancelled) {
        return;
      }
      const payload = parseWSStreamEvent<T>(event.data);
      if (!payload) {
        return;
      }
      if (!eventTypes.includes(payload.type)) {
        return;
      }
      onEvent(payload);
    };

    return () => {
      cancelled = true;
      socket?.close();
    };
  }, [enabled, eventTypes, onEvent]);
}

function parseWSStreamEvent<T>(data: string): StreamEvent<T> | null {
  try {
    return JSON.parse(data) as StreamEvent<T>;
  } catch {
    return null;
  }
}
