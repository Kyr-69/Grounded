import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";

/**
 * Full-screen-ish celebration when every task of the day is checked off.
 * Shows the day's base XP and the consistency multiplier doing its work.
 */
export function DayCelebration() {
  const { celebration, dismissCelebration, day } = useApp();

  useEffect(() => {
    if (!celebration) return;
    const id = setTimeout(dismissCelebration, 6000);
    return () => clearTimeout(id);
  }, [celebration, dismissCelebration]);

  if (!celebration) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
      onClick={dismissCelebration}
      role="alertdialog"
      aria-label="Day complete celebration"
    >
      <div className="w-full max-w-sm rounded-2xl border border-warning/50 bg-card p-6 text-center shadow-2xl animate-in zoom-in-95 fade-in duration-300">
        <p className="text-5xl">🎉</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">Day complete!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {day?.stats.total ?? 0} / {day?.stats.total ?? 0} — nothing missed.
        </p>

        {/* The math, made visible */}
        <div className="mt-5 space-y-1.5 rounded-xl border border-border bg-secondary/40 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tasks + day bonus</span>
            <span className="font-bold tabular-nums">+{celebration.baseXp} XP</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Consistency ⚡</span>
            <span className="font-bold tabular-nums text-warning">
              ×{celebration.multiplier.toFixed(2)}
              {celebration.stageTitle ? ` · ${celebration.stageTitle}` : ""}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <span className="font-semibold">Earned today</span>
            <span className="text-xl font-black tabular-nums text-warning">
              +{celebration.grantedXp.toLocaleString()} XP
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">XP lands on your Rank instantly</p>

        <Button className="mt-4 w-full rounded-xl" onClick={dismissCelebration}>
          Let's keep it going
        </Button>
      </div>
    </div>
  );
}
