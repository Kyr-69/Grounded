import { Check, X, Lock, Clock, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeColor, withAlpha } from "@/lib/colors";
import { EmojiIcon } from "@/components/EmojiIcon";
import { Button } from "@/components/ui/button";
import {
  fmtWindow,
  fmtCountdown,
  minutesLeft,
  windowState,
} from "@/lib/time";
import type { TaskInstance } from "@/types";

interface Props {
  instance: TaskInstance;
  nowMins: number;
  onToggle: (instanceId: number) => void;
}

export function TaskCard({ instance, nowMins, onToggle }: Props) {
  const { task, status } = instance;
  const ws = windowState(task, nowMins);
  const color = safeColor(task.color);

  // Effective visual state: backend status wins, else live window state
  const effective =
    status === "done" ? "done" : status === "failed" ? "failed" : ws === "active" ? "active" : "waiting";

  const active = effective === "active";
  const done = effective === "done";
  const failed = effective === "failed";

  const canCheck = active && status === "pending";
  const canUncheck = active && status === "done";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3 transition-all",
        !active && !done && !failed && "border-border bg-card"
      )}
      style={
        active
          ? {
              borderColor: withAlpha(color, 0.55),
              background: `linear-gradient(135deg, ${withAlpha(color, 0.16)}, ${withAlpha(color, 0.05)})`,
              boxShadow: `0 0 22px -6px ${withAlpha(color, 0.5)}`,
            }
          : done
            ? { borderColor: withAlpha(color, 0.4), background: withAlpha(color, 0.1) }
            : failed
              ? { borderColor: "transparent", background: "rgba(244, 63, 94, 0.08)" }
              : undefined
      }
    >
      {/* Icon tile tinted with the task color */}
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-xl"
        style={{ background: withAlpha(color, failed ? 0.1 : 0.18) }}
      >
        <EmojiIcon
          emoji={task.icon}
          className="size-6"
          fallbackClassName={cn("text-xl leading-none", failed && "grayscale opacity-60")}
        />
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate font-semibold",
              failed && "text-muted-foreground line-through",
              done && "text-foreground"
            )}
          >
            {task.name}
          </span>
          {done && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: withAlpha(color, 0.2), color }}
            >
              Done
            </span>
          )}
          {failed && (
            <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
              Missed
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <span>{fmtWindow(task.start_minute, task.end_minute)}</span>
          {active && status === "pending" && (
            <span className="font-semibold" style={{ color }}>
              · {fmtCountdown(minutesLeft(task, nowMins))}
            </span>
          )}
          {done && instance.checked_at && (
            <span style={{ color }}>
              · {new Date(instance.checked_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          {failed && <span className="text-destructive">· window closed</span>}
        </div>
      </div>

      {/* Action */}
      {canCheck && (
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-90"
          style={{ background: color, boxShadow: `0 6px 18px -6px ${withAlpha(color, 0.8)}` }}
          onClick={() => onToggle(instance.id)}
          aria-label={`Mark ${task.name} as done`}
        >
          <Check className="size-5" strokeWidth={3} />
        </button>
      )}
      {canUncheck && (
        <Button
          size="icon"
          variant="ghost"
          className="size-10 rounded-full text-muted-foreground hover:text-foreground"
          onClick={() => onToggle(instance.id)}
          aria-label={`Undo ${task.name}`}
        >
          <Undo2 className="size-4" />
        </Button>
      )}
      {failed && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <X className="size-4" strokeWidth={3} />
        </div>
      )}
      {status === "done" && !active && <Lock className="size-4 shrink-0" style={{ color: withAlpha(color, 0.6) }} />}
    </div>
  );
}
