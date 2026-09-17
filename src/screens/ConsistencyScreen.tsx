import { useMemo } from "react";
import { useApp } from "@/lib/store";
import { CONSISTENCY_STAGES, computeConsistency } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { Zap, Dumbbell, CalendarCheck, Coins } from "lucide-react";

/**
 * Consistency screen (replaces History): the sustained-discipline system.
 * Run counts consecutive days at ≥90% completion (today excluded until it
 * qualifies, zero-task days never break it). Placeholder UI for now.
 */
export function ConsistencyScreen() {
  const { history, refreshAll } = useApp();

  // Recompute on render; refresh keeps heatmap-derived data current.
  void refreshAll;
  const state = useMemo(() => computeConsistency(history), [history]);

  const grid = useMemo(() => [...history].sort((a, b) => a.date.localeCompare(b.date)), [history]);
  const runPct = state.next
    ? Math.min(100, Math.round((state.run / state.next.days) * 100))
    : 100;

  /** This ISO week (Mon..today): days hit, XP, workout hours. */
  const week = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const mondayStr = monday.toISOString().slice(0, 10);
    const days = history.filter((h) => h.date >= mondayStr);
    const daysHit = days.filter((h) => h.total > 0 && h.done === h.total).length;
    const daysWithTasks = days.filter((h) => h.total > 0).length;
    const xp = days.reduce((acc, h) => acc + (h.xp ?? 0), 0);
    const workoutMins = days.reduce((acc, h) => acc + (h.workout_minutes ?? 0), 0);
    return { daysHit, daysWithTasks, xp, workoutHours: Math.round((workoutMins / 60) * 10) / 10 };
  }, [history]);

  return (
    <div className="space-y-4 px-4 pt-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consistency</h1>
        <p className="text-sm text-muted-foreground">How long have you stayed disciplined?</p>
      </div>

      {/* Current stage hero */}
      <div className="rounded-xl border border-warning/40 bg-card p-5 text-center">
        <Zap className="mx-auto size-7 text-warning" />
        <p className="mt-2 text-3xl font-black tracking-wide text-warning">
          ⚡ {state.stage?.title ?? "Spark"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {state.run} day{state.run === 1 ? "" : "s"} at 90%+ · best run {state.best}
        </p>
        <div className="mx-auto mt-4 max-w-xs">
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-warning transition-all" style={{ width: `${runPct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {state.next
              ? `${state.next.days - state.run} more qualifying days → ${state.next.title} (${state.next.multiplier}×)`
              : "Maximum stage reached — Unstoppable ×3"}
          </p>
        </div>
      </div>

      {/* This week at a glance */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-border bg-card py-3">
          <CalendarCheck className="mx-auto size-4 text-success" />
          <div className="mt-1 text-xl font-bold tabular-nums">
            {week.daysHit}
            <span className="text-xs font-medium text-muted-foreground">/{Math.max(week.daysWithTasks, week.daysHit)}d</span>
          </div>
          <div className="text-[11px] text-muted-foreground">days hit</div>
        </div>
        <div className="rounded-xl border border-warning/30 bg-warning/5 py-3">
          <Coins className="mx-auto size-4 text-warning" />
          <div className="mt-1 text-xl font-bold tabular-nums text-warning">{week.xp.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground">XP earned</div>
        </div>
        <div className="rounded-xl border border-info/30 bg-info/5 py-3">
          <Dumbbell className="mx-auto size-4 text-info" />
          <div className="mt-1 text-xl font-bold tabular-nums text-info">{week.workoutHours}h</div>
          <div className="text-[11px] text-muted-foreground">workouts</div>
        </div>
      </div>

      {/* 12-week heatmap (kept from History) */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="grid grid-cols-7 gap-1.5">
          {grid.map((h) => (
            <div
              key={h.date}
              title={h.vacation ? `${h.date}: day off 🏖️` : `${h.date}: ${h.done}/${h.total} done`}
              className={cn(
                "aspect-square rounded-[4px] border",
                h.vacation
                  ? "border-sky-400/60 bg-sky-400/70" // planned rest — blue
                  : h.total === 0
                    ? "border-border bg-secondary/40"
                    : h.done === h.total
                      ? "border-success/50 bg-success"
                      : h.completion_pct >= 90
                        ? "border-warning/50 bg-warning/70"
                        : h.completion_pct >= 50
                          ? "border-success/40 bg-success/60"
                          : h.completion_pct > 0
                            ? "border-success/30 bg-success/30"
                            : "border-destructive/40 bg-destructive/30"
              )}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>12 weeks ago</span>
          <div className="flex items-center gap-1">
            less
            <div className="size-2.5 rounded-[2px] bg-success/30" />
            <div className="size-2.5 rounded-[2px] bg-success/60" />
            <div className="size-2.5 rounded-[2px] bg-warning/70" />
            <div className="size-2.5 rounded-[2px] bg-success" />
            more
            <span className="ml-1.5" />
            🏖️
            <div className="size-2.5 rounded-[2px] bg-sky-400/70" />
            off
          </div>
        </div>
      </div>

      {/* Stage ladder */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Stages · sustained 90%+ days
        </p>
        <div className="space-y-1">
          {CONSISTENCY_STAGES.map((s) => {
            const reached = state.stage ? s.stage <= state.stage.stage : false;
            const isNext = state.next?.stage === s.stage;
            return (
              <div
                key={s.stage}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                  isNext ? "bg-warning/10" : reached ? "opacity-90" : "opacity-40"
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <span className="text-xs tabular-nums text-muted-foreground">{s.stage}</span>
                  {s.title}
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{s.days}d</span>
                  <span className={cn("font-bold", reached ? "text-warning" : "")}>{s.multiplier}×</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
