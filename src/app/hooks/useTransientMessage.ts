/**
 * Ephemeral message hook for short-lived UI notifications.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Stores a transient message and exposes a helper to display it for a duration.
 *
 * @returns Current message and a display helper.
 */
export function useTransientMessage() {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showMessage = useCallback((nextMessage: string, durationMs = 1800) => {
    setMessage(nextMessage);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setMessage(null);
      timeoutRef.current = null;
    }, durationMs);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  return {
    message,
    showMessage,
  };
}
