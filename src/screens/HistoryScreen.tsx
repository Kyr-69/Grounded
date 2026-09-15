import { useEffect, useMemo } from "react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/ProgressRing";

export function HistoryScreen() {
  const { history, streak, refreshAll } = useApp();

  // Re-sync stats (streak, heatmap) whenever the tab is opened.
  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grid = useMemo(() => {
    // newest last so the grid reads left→right, top→bottom
    return [...history].sort((a, b) => a.date.localeCompare(b.date));
  }, [history]);

  const avg = useMemo(() => {
    const withData = history.filter((h) => h.total > 0);
    if (withData.length === 0) return 0;
    return Math.round(
      withData.reduce((acc, h) => acc + h.completion_pct, 0) / withData.length
    );
  }, [history]);

  const perfectDays = history.filter((h) => h.total > 0 && h.failed === 0 && h.done === h.total).length;

  return (
    <div className="space-y-5 px-4 pt-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">Last 12 weeks of showing up</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-border bg-card py-3">
          <div className="flex items-center justify-center">
            <ProgressRing value={avg} size={52} stroke={5}>
              <span className="text-xs font-bold">{avg}%</span>
            </ProgressRing>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">avg day</div>
        </div>
        <div className="rounded-xl border border-warning/30 bg-warning/5 py-3">
          <div className="text-2xl font-bold text-warning">🔥 {streak}</div>
          <div className="text-[11px] text-muted-foreground">day streak</div>
        </div>
        <div className="rounded-xl border border-success/30 bg-success/5 py-3">
          <div className="text-2xl font-bold text-success">{perfectDays}</div>
          <div className="text-[11px] text-muted-foreground">perfect days</div>
        </div>
      </div>

      {grid.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Complete your first day to see history here.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="grid grid-cols-7 gap-1.5">
            {grid.map((h) => (
              <div
                key={h.date}
                title={`${h.date}: ${h.done}/${h.total} done`}
                className={cn(
                  "aspect-square rounded-[4px] border",
                  h.total === 0
                    ? "border-border bg-secondary/40"
                    : h.done === h.total
                      ? "border-success/50 bg-success"
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
              <div className="size-2.5 rounded-[2px] bg-success" />
              more
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
