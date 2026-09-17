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

const KEY = "grounded-demo-v2"; // v1: pre-creation-day seeding bug

interface DemoState {
  tasks: RoutineTask[];
  instances: TaskInstance[];
  settings: Settings;
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
      return s;
    }
  } catch {
    /* fall through to fresh state */
  }
  return { tasks: [], instances: [], settings: DEFAULT_SETTINGS };
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
    return { date, instances: instances.map((i) => ({ ...i })), stats };
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
    const todayStr = dateStrOf(now);
    const out: HistoryEntry[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(now.y, now.m - 1, now.d - i);
      const ds = dateStrOf({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
      const day = demoApi.getDay(ds); // also syncs rollover/fail for that date
      const pct = day.stats.total > 0 ? Math.round((day.stats.done / day.stats.total) * 100) : 0;
      out.push({ date: ds, total: day.stats.total, done: day.stats.done, failed: day.stats.failed, completion_pct: pct });
    }
    void todayStr;
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
