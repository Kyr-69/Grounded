import { invoke } from "@tauri-apps/api/core";
import { demoApi } from "@/lib/demoBackend";
import type {
  DayPayload,
  HistoryEntry,
  Settings,
  TaskInput,
  RoutineTask,
  TaskInstance,
  DayStats,
} from "@/types";

/** True when running inside a Tauri webview (vs. a plain browser preview). */
export const inTauri =
  typeof window !== "undefined" &&
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    undefined;

interface InstanceResult {
  instance: TaskInstance;
  stats: DayStats;
}

/**
 * Unified API: real Rust commands inside Tauri; the localStorage demo
 * backend (same rules) in browser previews.
 */
export const api = {
  async getDay(date: string): Promise<DayPayload> {
    return inTauri ? invoke<DayPayload>("get_day", { date }) : demoApi.getDay(date);
  },
  async checkTask(instanceId: number): Promise<InstanceResult> {
    return inTauri
      ? invoke<InstanceResult>("check_task", { instanceId })
      : demoApi.checkTask(instanceId);
  },
  async uncheckTask(instanceId: number): Promise<InstanceResult> {
    return inTauri
      ? invoke<InstanceResult>("uncheck_task", { instanceId })
      : demoApi.uncheckTask(instanceId);
  },
  async listTasks(): Promise<RoutineTask[]> {
    return inTauri ? invoke<RoutineTask[]>("list_tasks") : demoApi.listTasks();
  },
  async createTask(input: TaskInput): Promise<RoutineTask> {
    return inTauri
      ? invoke<RoutineTask>("create_task", { input })
      : demoApi.createTask(input);
  },
  async updateTask(id: number, input: TaskInput): Promise<RoutineTask> {
    return inTauri
      ? invoke<RoutineTask>("update_task", { id, input })
      : demoApi.updateTask(id, input);
  },
  async deleteTask(id: number): Promise<void> {
    return inTauri ? invoke<void>("delete_task", { id }) : demoApi.deleteTask(id);
  },
  async getHistory(days: number): Promise<HistoryEntry[]> {
    return inTauri
      ? invoke<HistoryEntry[]>("get_history", { days })
      : demoApi.getHistory(days);
  },
  async getStreak(): Promise<number> {
    return inTauri ? invoke<number>("get_streak") : demoApi.getStreak();
  },
  async getSettings(): Promise<Settings> {
    return inTauri ? invoke<Settings>("get_settings") : demoApi.getSettings();
  },
  async saveSettings(settings: Settings): Promise<void> {
    return inTauri
      ? invoke<void>("save_settings", { settings })
      : demoApi.saveSettings(settings);
  },
};

/**
 * Thin wrapper over invoke: in dev-in-browser mode (no Tauri runtime)
 * these calls would fail, so components should use the store which
 * surfaces errors gracefully.
 */
export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args);
}
