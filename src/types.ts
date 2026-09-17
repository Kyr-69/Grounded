export type TaskStatus = "pending" | "done" | "failed";

export type TaskKind = "daily" | "physical";

export interface RoutineTask {
  id: number;
  name: string;
  icon: string;
  color: string; // hex accent, e.g. #34d399
  start_minute: number;
  end_minute: number;
  days_mask: number; // bit 0 = Monday ... bit 6 = Sunday
  created_at: string;
  kind: TaskKind; // physical tasks earn duration-scaled XP
}

export interface TaskInstance {
  id: number;
  task_id: number;
  date: string; // YYYY-MM-DD
  status: TaskStatus;
  checked_at: string | null;
  task: RoutineTask;
}

export interface DayStats {
  total: number;
  done: number;
  failed: number;
  pending: number;
}

export interface DayPayload {
  date: string;
  vacation: boolean;
  instances: TaskInstance[];
  stats: DayStats;
}

export interface HistoryEntry {
  date: string;
  total: number;
  done: number;
  failed: number;
  completion_pct: number;
  xp: number; // base XP earned that day (before consistency multiplier)
  vacation: boolean; // planned day off — shown blue on the heatmap
  workout_minutes: number; // completed physical-task time that day
}

export interface Settings {
  theme: "dark" | "light";
  day_start_hour: number; // 0-6: the hour your "day" begins
  notifications_enabled: boolean;
  time_zone: string; // "device" or an IANA name like "Asia/Kolkata"
}

export interface TaskInput {
  name: string;
  icon: string;
  color: string;
  start_minute: number;
  end_minute: number;
  days_mask: number;
  kind: TaskKind;
}

export type Tab = "today" | "routine" | "rank" | "consistency" | "settings";
