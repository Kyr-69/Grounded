import { useEffect, useRef } from "react";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { scheduleAll } from "@/lib/notify";
import { useApp } from "@/lib/store";

/**
 * Notification bootstrap: requests permission once, then (re)schedules
 * window-open reminders whenever the routine changes. Scheduling lives
 * here (TS, type-checked plugin API); the Rust core still enforces all
 * the accountability rules.
 */
export function NotificationsManager() {
  const { ready, settings, tasks } = useApp();
  const permitted = useRef(false);

  useEffect(() => {
    if (!ready || !settings.notifications_enabled || tasks.length === 0) return;
    (async () => {
      try {
        if (!permitted.current) {
          let granted = await isPermissionGranted();
          if (!granted) {
            const perm = await requestPermission();
            granted = perm === "granted";
          }
          permitted.current = granted;
        }
        if (permitted.current) {
          await scheduleAll(tasks);
        }
      } catch {
        // Not in Tauri runtime or notifications unavailable — ignore.
      }
    })();
  }, [ready, settings.notifications_enabled, tasks]);

  return null;
}
