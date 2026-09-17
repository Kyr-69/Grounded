/**
 * Demo backend for browser previews (no Tauri runtime).
 * Mirrors the Rust command surface and enforces the same accountability
 * rules — windows, auto-fail, day rollover — backed by localStorage.
 * Data is fake-but-honest: identical logic, separate storage.
 */
import type {
  DayPayload,
  HistoryEntry,
  RoutineTask,
  Settings,
  TaskInstance,
} from "@/types";

const KEY = "grounded-demo-v3"; // v2: pre-kind/vacation era

interface DemoState {
  tasks: RoutineTask[];
  instances: TaskInstance[];
  settings: Settings;
  vacation_days: string[];
  /** XP moved out of the history window — counted forever. */
  xp_bank: number;
  /** Days already banked, so advancing is idempotent. */
  xp_banked_days: Record<string, number>;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  day_start_hour: 0,
  notifications_enabled: true,
  time_zone: "device",
};

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as DemoState;
      // Tasks saved before per-task colors existed get the default green.
      for (const t of s.tasks) if (!t.color) t.color = "#34d399";
      for (const i of s.instances) if (i.task && !i.task.color) i.task.color = "#34d399";
      // Tasks saved before daily/physical kinds existed default to daily.
      for (const t of s.tasks) if (!t.kind) t.kind = "daily";
      for (const i of s.instances) if (i.task && !i.task.kind) i.task.kind = "daily";
      if (!s.vacation_days) s.vacation_days = [];
      if (typeof s.xp_bank !== "number") s.xp_bank = 0;
      if (!s.xp_banked_days) s.xp_banked_days = {};
      return s;
    }
  } catch {
    /* fall through to fresh state */
  }
  return {
    tasks: [],
    instances: [],
    settings: DEFAULT_SETTINGS,
    vacation_days: [],
    xp_bank: 0,
    xp_banked_days: {},
  };
}

function save(state: DemoState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode etc. — demo still works in-memory */
  }
}

// -- time helpers (mirror lib/time.ts + the Rust engine) ---------------------

function partsNow(zone: string) {
  const d = new Date();
  if (!zone || zone === "device") {
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes() };
  }
  try {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
    return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") % 24, min: get("minute") };
  } catch {
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes() };
  }
}

function dateStrOf(p: { y: number; m: number; d: number }) {
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function dowMon0(p: { y: number; m: number; d: number }) {
  return (new Date(p.y, p.m - 1, p.d).getDay() + 6) % 7;
}

function dateParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

// -- command implementations --------------------------------------------------

export const demoApi = {
  getDay(date: string): DayPayload {
    const s = load();
    const now = partsNow(s.settings.time_zone);
    const todayStr = dateStrOf(now);
    const isToday = date === todayStr;
    const nowMins = now.h * 60 + now.min;

    // Vacation days stay empty: no seeding, no auto-fail.
    if (s.vacation_days.includes(date)) {
      s.instances = s.instances.filter((i) => i.date === date && i.status === "done");
      save(s);
      return {
        date,
        vacation: true,
        instances: s.instances.filter((i) => i.date === date).map((i) => ({ ...i })),
        stats: { total: 0, done: 0, failed: 0, pending: 0 },
      };
    }

    // Rollover: ensure every task scheduled today has an instance.
    if (isToday) {
      const bit = dowMon0(now);
      for (const t of s.tasks) {
        if (!(t.days_mask & (1 << bit))) continue;
        if (!s.instances.some((i) => i.task_id === t.id && i.date === date)) {
          s.instances.push({
            id: nextId(s.instances),
            task_id: t.id,
            date,
            status: "pending",
            checked_at: null,
            task: t,
          });
        }
      }
    }

    // Past days without records seed as failed — but only on/after the
    // task's creation date (accountability starts when the routine starts).
    if (!isToday && date < todayStr) {
      const bit = dowMon0(dateParts(date));
      for (const t of s.tasks) {
        if (!(t.days_mask & (1 << bit))) continue;
        if (t.created_at.slice(0, 10) > date) continue;
        if (!s.instances.some((i) => i.task_id === t.id && i.date === date)) {
          s.instances.push({
            id: nextId(s.instances),
            task_id: t.id,
            date,
            status: "failed",
            checked_at: null,
            task: t,
          });
        }
      }
    }

    // Auto-fail overdue windows (today: wall-clock past end; past: everything pending).
    for (const i of s.instances) {
      if (i.status !== "pending") continue;
      const closed = isToday ? i.task.end_minute <= nowMins : i.date < todayStr;
      if (closed) i.status = "failed";
    }
    save(s);

    const instances = s.instances
      .filter((i) => i.date === date)
      .sort((a, b) => a.task.start_minute - b.task.start_minute);
    const stats = {
      total: instances.length,
      done: instances.filter((i) => i.status === "done").length,
      failed: instances.filter((i) => i.status === "failed").length,
      pending: instances.filter((i) => i.status === "pending").length,
    };
    return { date, vacation: false, instances: instances.map((i) => ({ ...i })), stats };
  },

  checkTask(instanceId: number): { instance: TaskInstance; stats: DayPayload["stats"] } {
    const s = load();
    const now = partsNow(s.settings.time_zone);
    const nowMins = now.h * 60 + now.min;
    const todayStr = dateStrOf(now);
    const inst = s.instances.find((i) => i.id === instanceId);
    if (!inst) throw new Error("instance not found");
    if (inst.date !== todayStr) throw new Error("This task belongs to another day — history is locked.");
    if (inst.status === "failed") throw new Error("Too late — this window already closed.");
    if (inst.status === "done") throw new Error("Already checked off.");
    if (nowMins < inst.task.start_minute) throw new Error("Too early — the window is not open yet.");
    if (nowMins >= inst.task.end_minute) throw new Error("Too late — the window already closed.");

    inst.status = "done";
    inst.checked_at = `${todayStr}T${String(now.h).padStart(2, "0")}:${String(now.min).padStart(2, "0")}:00`;
    save(s);
    return { instance: { ...inst }, stats: statsFor(s, inst.date) };
  },

  uncheckTask(instanceId: number): { instance: TaskInstance; stats: DayPayload["stats"] } {
    const s = load();
    const todayStr = dateStrOf(partsNow(s.settings.time_zone));
    const inst = s.instances.find((i) => i.id === instanceId);
    if (!inst) throw new Error("instance not found");
    if (inst.status !== "done") throw new Error("Nothing to undo.");
    if (inst.date !== todayStr) throw new Error("History is locked.");
    inst.status = "pending";
    inst.checked_at = null;
    save(s);
    return { instance: { ...inst }, stats: statsFor(s, inst.date) };
  },

  listTasks(): RoutineTask[] {
    return [...load().tasks].sort((a, b) => a.start_minute - b.start_minute);
  },

  createTask(input: Omit<RoutineTask, "id" | "created_at">): RoutineTask {
    const s = load();
    const t: RoutineTask = {
      ...input,
      id: nextId(s.tasks),
      created_at: new Date().toISOString(),
    };
    s.tasks.push(t);
    save(s);
    return { ...t };
  },

  updateTask(id: number, input: Omit<RoutineTask, "id" | "created_at">): RoutineTask {
    const s = load();
    const t = s.tasks.find((x) => x.id === id);
    if (!t) throw new Error("task not found");
    Object.assign(t, input);
    // Keep today's pending instance in sync with the new window.
    const now = partsNow(s.settings.time_zone);
    const todayStr = dateStrOf(now);
    const inst = s.instances.find((i) => i.task_id === id && i.date === todayStr && i.status === "pending");
    if (inst) inst.task = { ...t };
    save(s);
    return { ...t };
  },

  deleteTask(id: number) {
    const s = load();
    s.tasks = s.tasks.filter((t) => t.id !== id);
    s.instances = s.instances.filter((i) => i.task_id !== id);
    save(s);
  },

  getHistory(days: number): HistoryEntry[] {
    const s = load();
    const now = partsNow(s.settings.time_zone);
    const out: HistoryEntry[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(now.y, now.m - 1, now.d - i);
      const ds = dateStrOf({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
      const day = demoApi.getDay(ds); // also syncs rollover/fail for that date
      const pct = day.stats.total > 0 ? Math.round((day.stats.done / day.stats.total) * 100) : 0;
      out.push({
        date: ds,
        total: day.stats.total,
        done: day.stats.done,
        failed: day.stats.failed,
        completion_pct: pct,
        xp: dayXpFor(s, ds, day.stats),
        vacation: s.vacation_days.includes(ds),
        workout_minutes: workoutMinutesFor(s, ds),
      });
    }
    return out;
  },

  getStreak(): number {
    const s = load();
    const now = partsNow(s.settings.time_zone);
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(now.y, now.m - 1, now.d - i);
      const ds = dateStrOf({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
      const instances = s.instances.filter((x) => x.date === ds);
      if (instances.length === 0) continue;
      if (instances.some((x) => x.status === "failed")) break;
      if (instances.every((x) => x.status === "done")) streak++;
      else if (i === 0) continue;
      else break;
    }
    return streak;
  },

  getSettings(): Settings {
    return { ...load().settings };
  },

  saveSettings(settings: Settings) {
    const s = load();
    s.settings = { ...settings };
    save(s);
  },

  /** Bank XP from days older than cutoff (idempotent per day). */
  advanceXpBank(cutoffDate: string, multiplier: number): number {
    const s = load();
    const mult = Number.isFinite(multiplier) && multiplier >= 1 ? multiplier : 1;
    const dates = [...new Set(s.instances.map((i) => i.date))]
      .filter((d) => d < cutoffDate && !(d in s.xp_banked_days))
      .sort();
    let total = 0;
    for (const d of dates) {
      const day = demoApi.getDay(d);
      const base = dayXpFor(s, d, day.stats);
      const granted = Math.round(base * mult);
      s.xp_banked_days[d] = granted;
      total += granted;
    }
    s.xp_bank += total;
    save(s);
    return s.xp_bank;
  },

  getXpBank(): number {
    return load().xp_bank;
  },

  setVacation(date: string, on: boolean): DayPayload {
    const s = load();
    if (on) {
      if (!s.vacation_days.includes(date)) s.vacation_days.push(date);
      s.instances = s.instances.filter((i) => i.date !== date || i.status === "done");
    } else {
      s.vacation_days = s.vacation_days.filter((d) => d !== date);
      save(s);
      return demoApi.getDay(date); // re-seeds like a normal day
    }
    save(s);
    return demoApi.getDay(date);
  },

  /** Full JSON backup of demo state (mirrors the Rust export_data). */
  exportData(): string {
    const s = load();
    return JSON.stringify(
      {
        app: "Grounded",
        version: 1,
        exported_at: new Date().toISOString(),
        settings: s.settings,
        tasks: s.tasks,
        instances: s.instances,
        vacation_days: s.vacation_days,
        xp_bank: s.xp_bank,
        xp_banked_days: s.xp_banked_days,
      },
      null,
      2
    );
  },

  reset() {
    localStorage.removeItem(KEY);
  },
};

function statsFor(s: DemoState, date: string): DayPayload["stats"] {
  const instances = s.instances.filter((i) => i.date === date);
  return {
    total: instances.length,
    done: instances.filter((i) => i.status === "done").length,
    failed: instances.filter((i) => i.status === "failed").length,
    pending: instances.filter((i) => i.status === "pending").length,
  };
}

function nextId(list: { id: number }[]): number {
  return list.length === 0 ? 1 : Math.max(...list.map((x) => x.id)) + 1;
}

/** Minutes of completed physical-task windows on a date. */
function workoutMinutesFor(s: DemoState, date: string): number {
  return s.instances
    .filter((i) => i.date === date && i.status === "done" && (i.task.kind ?? "daily") === "physical")
    .reduce((acc, i) => acc + Math.max(i.task.end_minute - i.task.start_minute, 0), 0);
}

/** XP for one completed instance: physical = 1000/h, daily = flat 50. */
export function xpForInstance(kind: string, startMinute: number, endMinute: number): number {
  if (kind === "physical") {
    const mins = Math.max(endMinute - startMinute, 0);
    return Math.round(((mins / 60) * 1000) / 50) * 50;
  }
  return 50;
}

/** Base XP earned on a date (task rewards + perfect-day bonus). */
function dayXpFor(s: DemoState, date: string, stats: DayPayload["stats"]): number {
  if (stats.done === 0) return 0;
  const done = s.instances.filter((i) => i.date === date && i.status === "done");
  let xp = done.reduce(
    (acc, i) => acc + xpForInstance(i.task.kind ?? "daily", i.task.start_minute, i.task.end_minute),
    0
  );
  if (stats.total > 0 && stats.done === stats.total) xp += 800;
  return xp;
}
