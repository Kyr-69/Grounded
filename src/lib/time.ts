import type { TaskInstance } from "@/types";

/** Format minutes-since-midnight as h:mm AM/PM */
export function fmtTime(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function fmtWindow(start: number, end: number): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

/**
 * Wall-clock parts (year, month, day, hour, minute) in a given zone.
 * zone "device" (or empty) uses the device's current zone; anything else
 * is treated as an IANA name ("Asia/Kolkata", "UTC", ...) and falls back
 * to the device clock if the name is unknown.
 */
export function zonedParts(zone: string = "device"): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  seconds: number;
} {
  const d = new Date();
  const device = () => ({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    seconds: d.getSeconds(),
  });
  if (!zone || zone === "device") return device();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    const hour = get("hour") % 24; // some engines report 24 at midnight
    return {
      year: get("year"),
      month: get("month"),
      day: get("day"),
      hour,
      minute: get("minute"),
      seconds: get("second"),
    };
  } catch {
    return device();
  }
}

/** True if the zone is a name Intl understands (or the explicit "device"). */
export function isValidZone(zone: string): boolean {
  if (!zone || zone === "device") return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Current wall-clock minutes since midnight in the given zone.
 * NOTE: deliberately NOT day-boundary shifted — the Rust engine compares
 * task windows against plain wall-clock time, and the UI must match.
 * The boundary only affects which routine-day "today" is (see todayStr).
 */
export function nowMinutes(zone = "device"): number {
  const p = zonedParts(zone);
  return p.hour * 60 + p.minute;
}

/** Date string (YYYY-MM-DD) for "the current day", honoring zone + boundary. */
export function todayStr(boundaryHour: number, zone = "device"): string {
  if (!zone || zone === "device") {
    const now = new Date();
    const shifted = new Date(now.getTime() - boundaryHour * 3600_000);
    return toDateStr(shifted);
  }
  const p = zonedParts(zone);
  // Shift whole hours in UTC so DST never distorts the boundary math.
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour - boundaryHour, p.minute));
  return shifted.toISOString().slice(0, 10);
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Shift a YYYY-MM-DD date by n days. */
export function shiftDate(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDateStr(dt);
}

/** 0 = Monday ... 6 = Sunday (matches Rust days_mask bit order) */
export function dayIndexMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function dayNameShort(i: number): string {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i];
}

export function dayNameFull(i: number): string {
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i];
}

export const MASK_EVERY_DAY = 0b1111111;
export const MASK_WEEKDAYS = 0b0011111;
export const MASK_WEEKEND = 0b1100000;

/**
 * Human label for a days_mask: "Every day", "Weekdays", "Weekend",
 * or the list of days ("Mon Tue Thu").
 */
export function maskLabel(mask: number): string {
  if (mask === 0) return "no days";
  if (mask === MASK_EVERY_DAY) return "Every day";
  if (mask === MASK_WEEKDAYS) return "Weekdays";
  if (mask === MASK_WEEKEND) return "Weekend";
  const days: string[] = [];
  for (let i = 0; i < 7; i++) if (mask & (1 << i)) days.push(dayNameShort(i));
  return days.join(" ");
}

/**
 * Grouping for the Routine list. "week" = flat list; "split" = Weekdays /
 * Weekend sections; a number 0..6 = that single day's view.
 */
export type RoutineView = "week" | "split" | number;

/** Full date + time parts in the given zone (used for the Today header). */
export function partsInZone(zone = "device") {
  return zonedParts(zone);
}

/**
 * Repeat presets for the task editor. "custom" is on when the current
 * mask matches none of the named presets.
 */
export type RepeatPreset = "everyday" | "weekdays" | "weekend" | "custom";

export function presetForMask(mask: number): RepeatPreset {
  if (mask === MASK_EVERY_DAY) return "everyday";
  if (mask === MASK_WEEKDAYS) return "weekdays";
  if (mask === MASK_WEEKEND) return "weekend";
  return "custom";
}

export function maskForPreset(p: Exclude<RepeatPreset, "custom">): number {
  if (p === "everyday") return MASK_EVERY_DAY;
  if (p === "weekdays") return MASK_WEEKDAYS;
  return MASK_WEEKEND;
}

export type WindowState = "upcoming" | "active" | "missed";

/** Window state of a task right now (client-side mirror of Rust logic). */
export function windowState(
  task: { start_minute: number; end_minute: number },
  nowMins: number
): WindowState {
  if (nowMins < task.start_minute) return "upcoming";
  if (nowMins >= task.end_minute) return "missed";
  return "active";
}

export function isToday(date: string, boundaryHour: number): boolean {
  return date === todayStr(boundaryHour);
}

/** Minutes remaining in the active window. */
export function minutesLeft(task: { end_minute: number }, nowMins: number): number {
  return Math.max(0, task.end_minute - nowMins);
}

export function fmtCountdown(minsLeft: number): string {
  if (minsLeft <= 0) return "ending now";
  const h = Math.floor(minsLeft / 60);
  const m = minsLeft % 60;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

/** Group label for a task by its start time. */
export function partOfDay(startMinute: number): "Morning" | "Afternoon" | "Evening" {
  if (startMinute < 12 * 60) return "Morning";
  if (startMinute < 17 * 60) return "Afternoon";
  return "Evening";
}

export const TASK_STATUS_ORDER: Record<string, number> = {
  active: 0,
  upcoming: 1,
  pending: 2,
  done: 3,
  failed: 4,
};

export function instanceSortKey(inst: TaskInstance, nowMins: number): number {
  if (inst.status === "done") return TASK_STATUS_ORDER.done;
  if (inst.status === "failed") return TASK_STATUS_ORDER.failed;
  const ws = windowState(inst.task, nowMins);
  return ws === "active" ? TASK_STATUS_ORDER.active : TASK_STATUS_ORDER.upcoming;
}
