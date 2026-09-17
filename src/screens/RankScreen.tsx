import { useApp } from "@/lib/store";
import { RANKS, rankFor, totalXp } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

/**
 * Placeholder Rank screen — layout will be replaced by the user's design.
 * Shows the XP total, current rank with sub-progress, the full ladder,
 * and the consistency multiplier that amplifies XP.
 */
export function RankScreen() {
  const { history, consistency } = useApp();
  const mult = consistency?.multiplier ?? 1;
  const xp = totalXp(history, mult);
  const prog = rankFor(xp);

  return (
    <div className="space-y-4 px-4 pt-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rank</h1>
        <p className="text-sm text-muted-foreground">How much have you accomplished?</p>
      </div>

      {/* Profile card */}
      <div
        className="rounded-xl border border-border bg-card p-5 text-center"
        style={{ boxShadow: `0 0 40px -12px ${prog.rank.color}` }}
      >
        <Trophy className="mx-auto size-6" style={{ color: prog.rank.color }} />
        <p className="mt-2 text-2xl font-black tracking-wide" style={{ color: prog.rank.color }}>
          {prog.rank.name}
        </p>
        <p className="mt-1 text-3xl font-black tabular-nums">{xp.toLocaleString()} XP</p>

        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${prog.pct}%`, background: prog.rank.color }}
            />
          </div>
          {prog.next && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {prog.into.toLocaleString()} / {prog.span.toLocaleString()} XP → {prog.next.name}
            </p>
          )}
        </div>

        {/* Multiplier banner */}
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 py-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">XP multiplier</p>
          <p className="text-lg font-bold text-warning">
            ⚡ {mult.toFixed(2)}×{consistency?.stage ? ` · ${consistency.stage.title}` : ""}
          </p>
        </div>
      </div>

      {/* Full ladder */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          All ranks
        </p>
        <div className="space-y-1">
          {[...RANKS].reverse().map((r) => {
            const reached = xp >= r.minXp;
            const isCurrent = r.id === prog.rank.id;
            return (
              <div
                key={r.id}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-1.5 text-sm",
                  isCurrent ? "bg-primary/10 font-semibold" : reached ? "opacity-80" : "opacity-40"
                )}
              >
                <span style={{ color: reached ? r.color : undefined }}>{r.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {r.minXp.toLocaleString()} XP
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
