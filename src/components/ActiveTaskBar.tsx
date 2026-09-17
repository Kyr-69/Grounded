import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { withAlpha, safeColor } from "@/lib/colors";
import { EmojiIcon } from "@/components/EmojiIcon";
import { cn } from "@/lib/utils";

/**
 * Persistent "now" strip: the task whose window is currently open,
 * with a live progress bar draining toward the window's close.
 * Renders nothing when no window is open.
 */
export function ActiveTaskBar() {
  const { day, nowMins } = useApp();
  const [, forceTick] = useState(0);

  // Re-render every 15s so the bar animates smoothly between store ticks.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const active = useMemo(() => {
    const inst = (day?.instances ?? []).find(
      (i) => i.status === "pending" && nowMins >= i.task.start_minute && nowMins < i.task.end_minute
    );
    if (!inst) return null;
    const span = inst.task.end_minute - inst.task.start_minute;
    const elapsed = Math.min(Math.max(nowMins - inst.task.start_minute, 0), span);
    return {
      id: inst.id,
      name: inst.task.name,
      icon: inst.task.icon,
      color: safeColor(inst.task.color),
      pct: span > 0 ? Math.round((elapsed / span) * 100) : 0,
      minsLeft: inst.task.end_minute - nowMins,
    };
  }, [day, nowMins]);

  if (!active) return null;

  return (
    <div
      role="status"
      aria-label={`Active task: ${active.name}, ${active.minsLeft} minutes left`}
      className="fixed inset-x-3 bottom-[76px] z-30 overflow-hidden rounded-xl border bg-card/95 shadow-lg backdrop-blur"
      style={{ borderColor: withAlpha(active.color, 0.5) }}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: withAlpha(active.color, 0.18) }}
        >
          <EmojiIcon emoji={active.icon} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold">{active.name}</p>
            <p className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              {active.minsLeft}m left
            </p>
          </div>
          {/* The loading bar: fills as the window burns down */}
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full transition-all duration-500 ease-linear")}
              style={{
                width: `${active.pct}%`,
                background: `linear-gradient(90deg, ${withAlpha(active.color, 0.6)}, ${active.color})`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
