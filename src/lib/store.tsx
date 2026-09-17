import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, inTauri } from "@/lib/api";
import { nowMinutes, todayStr } from "@/lib/time";
import { computeConsistency, xpForTask, XP_PERFECT_DAY, type ConsistencyState } from "@/lib/progress";
import type {
  DayPayload,
  HistoryEntry,
  RoutineTask,
  Settings,
  TaskInput,
} from "@/types";

interface AppState {
  ready: boolean;
  offline: boolean; // true when not running inside Tauri (dev in browser)
  day: DayPayload | null;
  tasks: RoutineTask[];
  settings: Settings;
  history: HistoryEntry[];
  streak: number;
  consistency: ConsistencyState;
  /** XP banked from days that aged out of the history window. */
  xpBank: number;
  nowMins: number;
  error: string | null;
  refreshDay: (date?: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  checkTask: (instanceId: number) => Promise<void>;
  uncheckTask: (instanceId: number) => Promise<void>;
  createTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: number, input: TaskInput) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  setVacation: (on: boolean) => Promise<void>;
  xpPop: XpPop | null;
  celebration: DayCelebration | null;
  dismissXpPop: () => void;
  dismissCelebration: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  day_start_hour: 0,
  notifications_enabled: true,
  time_zone: "device",
};

const AppContext = createContext<AppState | null>(null);

/** Floating "+XP" toast shown right after a check-off. */
export interface XpPop {
  id: number;
  amount: number;
  physical: boolean;
}

/** Full-screen celebration when the last task of the day is checked off. */
export interface DayCelebration {
  id: number;
  baseXp: number;
  multiplier: number;
  grantedXp: number;
  stageTitle: string | null;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(!inTauri);
  const [day, setDay] = useState<DayPayload | null>(null);
  const [tasks, setTasks] = useState<RoutineTask[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [streak, setStreak] = useState(0);
  const [nowMins, setNowMins] = useState(() => nowMinutes(DEFAULT_SETTINGS.time_zone));
  const [error, setError] = useState<string | null>(null);

  const consistency = useMemo(() => computeConsistency(history), [history]);
  const [xpBank, setXpBank] = useState(0);
  const [xpPop, setXpPop] = useState<XpPop | null>(null);
  const [celebration, setCelebration] = useState<DayCelebration | null>(null);
  const dismissXpPop = useCallback(() => setXpPop(null), []);
  const dismissCelebration = useCallback(() => setCelebration(null), []);

  const guard = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (e) {
        const msg = String(e);
        if (!inTauri) {
          // Demo backend: thrown errors are real rule violations — show them.
          setError(msg.replace(/^Error:\s*/, ""));
        } else if (
          msg.includes("__TAURI") ||
          msg.includes("invoke") ||
          msg.includes("Forbidden")
        ) {
          setOffline(true);
        } else {
          setError(msg.replace(/^Error:\s*/, ""));
        }
        return undefined;
      }
    },
    []
  );

  const refreshDay = useCallback(
    async (date?: string) => {
      const d = await guard(() =>
        api.getDay(date ?? todayStr(settings.day_start_hour, settings.time_zone))
      );
      if (d) setDay(d);
    },
    [guard, settings.day_start_hour, settings.time_zone]
  );

  const refreshAll = useCallback(async () => {
    const s = await guard(() => api.getSettings());
    if (s) {
      setSettings(s);
      document.documentElement.classList.toggle("dark", s.theme === "dark");
    }
    const eff = s ?? DEFAULT_SETTINGS;
    setNowMins(nowMinutes(eff.time_zone));
    const d = await guard(() => api.getDay(todayStr(eff.day_start_hour)));
    if (d) setDay(d);
    const t = await guard(() => api.listTasks());
    if (t) setTasks(t);
    const h = await guard(() => api.getHistory(84));
    if (h) setHistory(h);
    const st = await guard(() => api.getStreak());
    if (st !== undefined) setStreak(st as unknown as number);
    const bank = await guard(() => api.getXpBank());
    if (bank !== undefined) setXpBank(bank as unknown as number);
  }, [guard]);

  useEffect(() => {
    (async () => {
      await refreshAll();
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick the clock every 30s so windows/countdowns stay live.
  useEffect(() => {
    const id = setInterval(() => {
      setNowMins(nowMinutes(settings.time_zone));
    }, 30_000);
    return () => clearInterval(id);
  }, [settings.time_zone]);

  // Bank XP from days that fell out of the 84-day history window, so Rank
  // keeps counting the whole journey. Runs on load and whenever the oldest
  // in-window date changes; the backend call is idempotent per day.
  useEffect(() => {
    if (!ready || history.length === 0) return;
    const oldest = history.reduce((min, h) => (h.date < min ? h.date : min), history[0].date);
    const mult = consistency.multiplier;
    void (async () => {
      const bank = await guard(() => api.advanceXpBank(oldest, mult));
      if (bank !== undefined) setXpBank(bank as unknown as number);
    })();
  }, [ready, history, consistency.multiplier, guard]);

  // When the local day rolls over, refresh automatically.
  useEffect(() => {
    const today = todayStr(settings.day_start_hour, settings.time_zone);
    if (day && day.date !== today) {
      void refreshDay(today);
    }
  }, [nowMins, day, settings.day_start_hour, settings.time_zone, refreshDay]);

  const checkTask = useCallback(
    async (instanceId: number) => {
      const prevDone = day?.stats.done ?? 0;
      const res = await guard(() => api.checkTask(instanceId));
      if (res && day) {
        const instances = day.instances.map((i) =>
          i.id === res.instance.id ? res.instance : i
        );
        setDay({
          ...day,
          instances,
          stats: res.stats,
        });

        // XP feedback: pop + haptic tick.
        const t = res.instance.task;
        const amount = xpForTask(t.kind ?? "daily", t.start_minute, t.end_minute);
        setXpPop({ id: Date.now(), amount, physical: t.kind === "physical" });
        try {
          navigator.vibrate?.(15);
        } catch {
          /* haptics unavailable */
        }

        // Day complete: last pending task just got checked off.
        if (
          prevDone < res.stats.done &&
          res.stats.total > 0 &&
          res.stats.done === res.stats.total
        ) {
          const base =
            instances
              .filter((i) => i.status === "done")
              .reduce(
                (acc, i) =>
                  acc + xpForTask(i.task.kind ?? "daily", i.task.start_minute, i.task.end_minute),
                0
              ) + XP_PERFECT_DAY;
          const mult = consistency.multiplier;
          setCelebration({
            id: Date.now(),
            baseXp: base,
            multiplier: mult,
            grantedXp: Math.round(base * mult),
            stageTitle: consistency.stage?.title ?? null,
          });
          try {
            navigator.vibrate?.([30, 60, 90]);
          } catch {
            /* haptics unavailable */
          }
        }
      }
    },
    [guard, day, consistency]
  );

  const uncheckTask = useCallback(
    async (instanceId: number) => {
      const res = await guard(() => api.uncheckTask(instanceId));
      if (res && day) {
        setDay({
          ...day,
          instances: day.instances.map((i) =>
            i.id === res.instance.id ? res.instance : i
          ),
          stats: res.stats,
        });
      }
    },
    [guard, day]
  );

  const createTask = useCallback(
    async (input: TaskInput) => {
      await guard(async () => {
        await api.createTask(input);
      });
      await refreshAll();
    },
    [guard, refreshAll]
  );

  const updateTask = useCallback(
    async (id: number, input: TaskInput) => {
      await guard(async () => {
        await api.updateTask(id, input);
      });
      await refreshAll();
    },
    [guard, refreshAll]
  );

  const deleteTask = useCallback(
    async (id: number) => {
      await guard(async () => {
        await api.deleteTask(id);
      });
      await refreshAll();
    },
    [guard, refreshAll]
  );

  const saveSettings = useCallback(
    async (s: Settings) => {
      setSettings(s);
      document.documentElement.classList.toggle("dark", s.theme === "dark");
      await guard(() => api.saveSettings(s));
      await refreshAll(); // reloads settings + re-anchors the clock to the new zone
    },
    [guard, refreshAll]
  );

  /** Toggle a vacation day for today (or un-vacation to return to work). */
  const setVacation = useCallback(
    async (on: boolean) => {
      const date = todayStr(settings.day_start_hour, settings.time_zone);
      const res = await guard(() => api.setVacation(date, on));
      if (res) {
        setDay(res);
        if (on) setTasks((ts) => ts); // tasks list unchanged; day view is what empties
      }
      await refreshAll();
    },
    [guard, refreshAll, settings.day_start_hour, settings.time_zone]
  );

  const value = useMemo<AppState>(
    () => ({
      ready,
      offline,
      day,
      tasks,
      settings,
      history,
      streak,
      consistency,
      xpBank,
      nowMins,
      error,
      refreshDay,
      refreshAll,
      checkTask,
      uncheckTask,
      createTask,
      updateTask,
      deleteTask,
      saveSettings,
      setVacation,
      xpPop,
      celebration,
      dismissXpPop,
      dismissCelebration,
    }),
    [
      xpPop,
      celebration,
      dismissXpPop,
      dismissCelebration,
      ready,
      offline,
      day,
      tasks,
      settings,
      history,
      streak,
      consistency,
      xpBank,
      nowMins,
      error,
      refreshDay,
      refreshAll,
      checkTask,
      uncheckTask,
      createTask,
      updateTask,
      deleteTask,
      saveSettings,
      setVacation,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
