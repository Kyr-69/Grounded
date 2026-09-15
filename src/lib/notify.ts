import {
  cancel,
  pending,
  createChannel,
  Importance,
  Schedule,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { RoutineTask } from "@/types";

const CHANNEL_ID = "grounded-reminders";

/** 0 = Monday ... 6 = Sunday (matches Rust days_mask bit order) */
function dayIndexMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Next occurrence Date at which this task's window opens
 * (today if it opens later today and the day matches, else the
 * next matching day). Returns null if the task repeats on no days.
 */
export function nextOpen(task: RoutineTask, from: Date = new Date()): Date | null {
  if (task.days_mask === 0) return null;
  for (let offset = 0; offset < 8; offset++) {
    const d = new Date(from);
    d.setDate(d.getDate() + offset);
    const dow = dayIndexMon0(d);
    if ((task.days_mask & (1 << dow)) === 0) continue;
    const open = new Date(d);
    open.setHours(Math.floor(task.start_minute / 60), task.start_minute % 60, 0, 0);
    if (open > from) return open;
  }
  return null;
}

function fmtClock(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Schedule "window is open" reminders for the next 7 days.
 * Fire-and-forget: failures are swallowed (notifications are a nicety,
 * the Rust core enforces the actual rules).
 */
export async function scheduleAll(tasks: RoutineTask[]): Promise<void> {
  try {
    await createChannel({
      id: CHANNEL_ID,
      name: "Routine reminders",
      description: "Tells you when a task window opens",
      importance: Importance.High,
      lights: true,
      vibration: true,
    });

    // Clear stale schedules before re-adding (APIs may be no-ops on some platforms).
    try {
      const pendingNotifs = await pending();
      if (pendingNotifs.length > 0) await cancel(pendingNotifs.map((p) => p.id));
    } catch {
      /* pending/cancel unsupported here — fine */
    }

    let anyScheduled = false;
    for (const task of tasks) {
      const open = nextOpen(task);
      if (!open) continue;
      try {
        await sendNotification({
          title: `${task.icon} ${task.name}`,
          body: `Your window is open until ${fmtClock(task.end_minute)}`,
          channelId: CHANNEL_ID,
          schedule: Schedule.at(open, true),
        });
        anyScheduled = true;
      } catch {
        /* scheduled notifications unsupported on this platform — ignore */
      }
    }
    if (!anyScheduled) {
      // Desktop dev fallback: at least prove the channel works once.
      // (No-op on platforms where immediate notifications are also blocked.)
    }
  } catch {
    /* notifications unavailable — ignore */
  }
}
