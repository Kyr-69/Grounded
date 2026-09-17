/**
 * Frontend wrapper for the native Android progress notification.
 * The bridge (window.GroundedNative) only exists inside the Tauri Android
 * build; everywhere else these calls are silently skipped.
 */
interface GroundedNative {
  showProgress(title: string, endLabel: string, progress: number): void;
  hideProgress(): void;
}

function bridge(): GroundedNative | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { GroundedNative?: GroundedNative };
  return w.GroundedNative ?? null;
}

export function nativeProgressSupported(): boolean {
  return bridge() !== null;
}

export function nativeShowProgress(title: string, endLabel: string, progress: number): void {
  try {
    bridge()?.showProgress(title, endLabel, progress);
  } catch {
    /* bridge unavailable — ignore */
  }
}

export function nativeHideProgress(): void {
  try {
    bridge()?.hideProgress();
  } catch {
    /* bridge unavailable — ignore */
  }
}
