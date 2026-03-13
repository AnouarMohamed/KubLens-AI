import type { Dispatch, SetStateAction } from "react";

type SetBool = Dispatch<SetStateAction<boolean>>;
type SetString = Dispatch<SetStateAction<string | null>>;

/**
 * Converts unknown thrown values into user-facing error text.
 */
export function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

interface RunReadLoadOptions {
  canRead: boolean;
  deniedMessage: string;
  fallbackError: string;
  setIsLoading: SetBool;
  setError: SetString;
  onDenied?: () => void;
  onSuccess?: () => void;
  load: () => Promise<void>;
}

/**
 * Runs a read-loader with standard auth guard, loading state, and error handling.
 *
 * @returns `true` when load completed successfully.
 */
export async function runReadLoad(options: RunReadLoadOptions): Promise<boolean> {
  const { canRead, deniedMessage, fallbackError, setIsLoading, setError, onDenied, onSuccess, load } = options;

  if (!canRead) {
    onDenied?.();
    setError(deniedMessage);
    setIsLoading(false);
    return false;
  }

  setIsLoading(true);
  try {
    await load();
    setError(null);
    onSuccess?.();
    return true;
  } catch (err) {
    setError(toErrorMessage(err, fallbackError));
    return false;
  } finally {
    setIsLoading(false);
  }
}

interface RunAsyncActionOptions {
  setBusy: SetBool;
  setError: SetString;
  fallbackError: string;
  action: () => Promise<void>;
}

/**
 * Runs an async mutation/action with shared busy + error behavior.
 *
 * @returns `true` when action completed successfully.
 */
export async function runAsyncAction(options: RunAsyncActionOptions): Promise<boolean> {
  const { setBusy, setError, fallbackError, action } = options;

  setBusy(true);
  try {
    await action();
    return true;
  } catch (err) {
    setError(toErrorMessage(err, fallbackError));
    return false;
  } finally {
    setBusy(false);
  }
}
