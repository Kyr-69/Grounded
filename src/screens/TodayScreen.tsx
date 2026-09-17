import { useMemo, useState } from "react";
import { Flame } from "lucide-react";
import { useApp } from "@/lib/store";
import { instanceSortKey, partOfDay, partsInZone } from "@/lib/time";
import { LiveClock } from "@/components/LiveClock";
import { TaskCard } from "@/components/TaskCard";
import { ProgressRing } from "@/components/ProgressRing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GROUPS = ["Morning", "Afternoon", "Evening"] as const;

type Filter = "All" | (typeof GROUPS)[number];

export function TodayScreen({ onGoToRoutine }: { onGoToRoutine: () => void }) {
  const { day, nowMins, settings, checkTask, uncheckTask, streak, offline, setVacation } = useApp();
  const [filter, setFilter] = useState<Filter>("All");
  const onVacation = day?.vacation ?? false;

  const groups = useMemo(() => {
    const list = day?.instances ?? [];
    const sorted = [...list].sort(
      (a, b) => instanceSortKey(a, nowMins) - instanceSortKey(b, nowMins) || a.task.start_minute - b.task.start_minute
    );
    const wanted: readonly string[] = filter === "All" ? GROUPS : [filter];
    return wanted
      .map((g) => ({
        label: g,
        items: sorted.filter((i) => partOfDay(i.task.start_minute) === g),
      }))
      .filter((g) => g.items.length > 0);
  }, [day, nowMins, filter]);

  const allInstances = day?.instances ?? [];
  const countFor = (g: Filter): number =>
    g === "All" ? allInstances.length : allInstances.filter((i) => partOfDay(i.task.start_minute) === g).length;

  const stats = day?.stats ?? { total: 0, done: 0, failed: 0, pending: 0 };
  const pct = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);

  return (
    <div className="space-y-5 px-4 pt-4">
      {offline && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          Demo mode — same rules, data stays in this browser. Run the Tauri app for the real thing.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">
              {greeting(nowMins + settings.day_start_hour)}
            </h1>
            <LiveClock zone={settings.time_zone} />
          </div>
          <p className="text-sm text-muted-foreground">
            {dateLabel(settings.time_zone)}
            {settings.time_zone !== "device" && (
              <span className="text-muted-foreground/60"> · {settings.time_zone}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <Badge variant="warning" className="gap-1 rounded-full px-2.5 py-1">
              <Flame className="size-3.5" /> {streak}d
            </Badge>
          )}
          <ProgressRing value={pct} size={64} stroke={6}>
            <span className="text-sm font-bold">{pct}%</span>
          </ProgressRing>
        </div>
      </div>

      {/* Summary strip */}
      {stats.total > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-success/30 bg-success/5 py-2">
            <div className="text-lg font-bold text-success">{stats.done}</div>
            <div className="text-[11px] text-muted-foreground">done</div>
          </div>
          <div className="rounded-lg border border-info/30 bg-info/5 py-2">
            <div className="text-lg font-bold text-info">{stats.pending}</div>
            <div className="text-[11px] text-muted-foreground">to go</div>
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 py-2">
            <div className="text-lg font-bold text-destructive">{stats.failed}</div>
            <div className="text-[11px] text-muted-foreground">missed</div>
          </div>
        </div>
      )}

      {/* Filter pills — All / Morning / Afternoon / Evening */}
      {allInstances.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {(["All", ...GROUPS] as Filter[]).map((f) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary"
                )}
              >
                {f}
                <span className={cn("ml-1.5 text-[10px] font-medium", on ? "opacity-75" : "opacity-50")}>
                  {countFor(f)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Vacation mode */}
      {onVacation && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-400/5 py-8 text-center">
          <span className="text-4xl">🏖️</span>
          <div>
            <p className="font-semibold">Day off — vacation mode</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              No tasks today. Your streak and consistency run are safe; this day simply doesn't count.
            </p>
          </div>
          <Button
            variant="outline"
            className="mt-1 rounded-xl"
            onClick={() => void setVacation(false)}
          >
            Back to work
          </Button>
        </div>
      )}

      {/* Empty state */}
      {stats.total === 0 && !onVacation && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
          <span className="text-4xl">🌱</span>
          <div>
            <p className="font-semibold">Your day is waiting</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Build your first routine to get grounded.
            </p>
          </div>
          <Button onClick={onGoToRoutine} className="mt-1 rounded-xl">
            Build my routine
          </Button>
        </div>
      )}

      {/* Groups */}
      {groups.map((g) => (
        <section key={g.label} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </h2>
          <div className="space-y-2">
            {g.items.map((inst) => (
              <TaskCard
                key={inst.id}
                instance={inst}
                nowMins={nowMins}
                onToggle={(id) => {
                  const target = inst.status === "done" ? uncheckTask : checkTask;
                  void target(id);
                }}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="pb-2 text-center text-[11px] text-muted-foreground">
        {onVacation ? "enjoy the rest — your run is preserved" : "tasks lock when their window closes"}
      </div>
    </div>
  );
}

function dateLabel(zone: string): string {
  const p = partsInZone(zone);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function greeting(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  if (h < 12) return "Good morning ☀️";
  if (h < 17) return "Good afternoon";
  return "Good evening 🌙";
}
