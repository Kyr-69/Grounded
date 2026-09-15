import { useMemo, useState } from "react";
import { CalendarDays, Clock3, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import {
  fmtWindow,
  dayNameFull,
  maskLabel,
  presetForMask,
  maskForPreset,
  type RepeatPreset,
  type RoutineView,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { safeColor, TASK_COLORS } from "@/lib/colors";
import { withAlpha } from "@/lib/colors";
import { EmojiIcon } from "@/components/EmojiIcon";
import { IconPicker } from "@/components/IconPicker";
import type { RoutineTask, TaskInput } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DAYS = [
  { bit: 0, label: "Mon" },
  { bit: 1, label: "Tue" },
  { bit: 2, label: "Wed" },
  { bit: 3, label: "Thu" },
  { bit: 4, label: "Fri" },
  { bit: 5, label: "Sat" },
  { bit: 6, label: "Sun" },
];

function minsToHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function hhmmToMins(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

interface FormState {
  name: string;
  icon: string;
  color: string;
  start: string;
  end: string;
  days: number;
}

const emptyForm: FormState = {
  name: "",
  icon: "💧",
  color: "#34d399",
  start: "08:00",
  end: "08:30",
  days: 0b1111111,
};

export function RoutineScreen() {
  const { tasks, createTask, updateTask, deleteTask } = useApp();
  const [editing, setEditing] = useState<RoutineTask | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoutineTask | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [view, setView] = useState<RoutineView>("week");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  // Inline time edits keyed by task id (edit mode only)
  const [inlineDraft, setInlineDraft] = useState<{
    id: number;
    start: string;
    end: string;
  } | null>(null);

  const todayBit = useMemo(() => {
    const d = new Date();
    return ((d.getDay() + 6) % 7) as number; // 0 = Mon
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
  };
  const openEdit = (t: RoutineTask) => {
    setEditing(t);
    setForm({
      name: t.name,
      icon: t.icon,
      color: safeColor(t.color),
      start: minsToHHMM(t.start_minute),
      end: minsToHHMM(t.end_minute),
      days: t.days_mask,
    });
  };

  const submit = async () => {
    if (!form || !form.name.trim()) return;
    const input: TaskInput = {
      name: form.name.trim(),
      icon: form.icon,
      color: form.color,
      start_minute: hhmmToMins(form.start),
      end_minute: hhmmToMins(form.end),
      days_mask: form.days,
    };
    if (input.end_minute <= input.start_minute) return; // window must be positive
    if (editing) await updateTask(editing.id, input);
    else await createTask(input);
    setForm(null);
    setEditing(null);
  };

  const commitInline = async () => {
    if (!inlineDraft) return;
    const t = tasks.find((x) => x.id === inlineDraft.id);
    if (!t) return setInlineDraft(null);
    const start = hhmmToMins(inlineDraft.start);
    const end = hhmmToMins(inlineDraft.end);
    if (end <= start) return; // invalid — stay open
    await updateTask(t.id, {
      name: t.name,
      icon: t.icon,
      color: safeColor(t.color),
      start_minute: start,
      end_minute: end,
      days_mask: t.days_mask,
    });
    setInlineDraft(null);
  };

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => a.start_minute - b.start_minute || a.id - b.id),
    [tasks]
  );

  /** Sections to render based on the active view. */
  const sections = useMemo(() => {
    if (typeof view === "number") {
      const dayTasks = sorted.filter((t) => t.days_mask & (1 << view));
      return [{ key: `day-${view}`, label: dayNameFull(view), items: dayTasks }];
    }
    if (view === "split") {
      const weekdays = sorted.filter((t) => t.days_mask & 0b0011111);
      const weekend = sorted.filter((t) => t.days_mask & 0b1100000);
      return [
        weekdays.length > 0 ? { key: "weekdays", label: "Weekdays · Mon–Fri", items: weekdays } : null,
        weekend.length > 0 ? { key: "weekend", label: "Weekend · Sat–Sun", items: weekend } : null,
      ].filter(Boolean) as { key: string; label: string; items: RoutineTask[] }[];
    }
    return [{ key: "week", label: "All week", items: sorted }];
  }, [sorted, view]);

  const applyPreset = (p: RepeatPreset) => {
    if (!form) return;
    if (p === "custom") return;
    setForm({ ...form, days: maskForPreset(p) });
  };

  const activePreset = form ? presetForMask(form.days) : "everyday";

  return (
    <div className="space-y-4 px-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My routine</h1>
          <p className="text-sm text-muted-foreground">
            {tasks.length} task{tasks.length === 1 ? "" : "s"} · check-offs only count inside their window
          </p>
        </div>
      </div>

      {/* Edit mode toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium">Edit mode</p>
          <p className="text-xs text-muted-foreground">
            {editMode
              ? "Tap any time to change it inline"
              : "Turn on to tweak times without opening the editor"}
          </p>
        </div>
        <EditModeSwitch on={editMode} onToggle={() => setEditMode((e) => !e)} />
      </div>

      {/* Day strip: pick a day, or how the week is grouped */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarDays className="size-3.5" /> Days
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setViewMenuOpen(true)}
            aria-label="Choose routine grouping"
          >
            <Layers className="size-3.5" />
            {view === "week" ? "All week" : view === "split" ? "Weekdays & weekend" : dayNameFull(view)}
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d) => {
            const isActiveDay = typeof view === "number" && view === d.bit;
            const isToday = d.bit === todayBit;
            const count = tasks.filter((t) => t.days_mask & (1 << d.bit)).length;
            return (
              <button
                key={d.bit}
                type="button"
                onClick={() => setView(isActiveDay ? "split" : d.bit)}
                className={cn(
                  "relative rounded-lg border py-1.5 text-center text-[11px] font-semibold transition-colors",
                  isActiveDay
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                )}
              >
                {d.label}
                {isToday && (
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-cyan-400" />
                )}
                {count > 0 && (
                  <span
                    className={cn(
                      "block text-[9px] font-normal",
                      isActiveDay ? "text-primary-foreground/70" : "text-muted-foreground/60"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tasks.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
          <span className="text-4xl">🗓️</span>
          <p className="font-semibold">No tasks yet</p>
          <p className="text-sm text-muted-foreground">Tap + to add your first one.</p>
        </div>
      )}

      {/* Grouped list with separator headers */}
      {sections.map((s) =>
        s.items.length === 0 && typeof view === "number" ? (
          <div
            key={s.key}
            className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border py-8 text-center"
          >
            <span className="text-2xl">🍃</span>
            <p className="text-sm text-muted-foreground">Nothing scheduled for {s.label.toLowerCase()}</p>
          </div>
        ) : (
          s.items.length > 0 && (
            <section key={s.key} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </h2>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {s.items.map((t) => {
                  const inlineActive = inlineDraft?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "rounded-xl border bg-card p-3 transition-colors",
                        inlineActive ? "border-primary/60" : "border-border"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex size-12 shrink-0 items-center justify-center rounded-xl"
                          style={{ background: withAlpha(safeColor(t.color), 0.18) }}
                        >
                          <EmojiIcon emoji={t.icon} className="size-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtWindow(t.start_minute, t.end_minute)} · {maskLabel(t.days_mask)}
                          </p>
                        </div>

                        {editMode && (
                          <Button
                            variant={inlineActive ? "secondary" : "outline"}
                            size="sm"
                            className="gap-1.5"
                            onClick={() =>
                              inlineActive
                                ? setInlineDraft(null)
                                : setInlineDraft({
                                    id: t.id,
                                    start: minsToHHMM(t.start_minute),
                                    end: minsToHHMM(t.end_minute),
                                  })
                            }
                          >
                            <Clock3 className="size-3.5" />
                            {inlineActive ? "Close" : "Time"}
                          </Button>
                        )}

                        {!editMode && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 text-muted-foreground"
                              onClick={() => openEdit(t)}
                              aria-label={`Edit ${t.name}`}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTarget(t)}
                              aria-label={`Delete ${t.name}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>

                      {/* Inline time editor (edit mode) */}
                      {editMode && inlineActive && (
                        <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor={`start-${t.id}`} className="text-xs text-muted-foreground">
                                Starts
                              </Label>
                              <Input
                                id={`start-${t.id}`}
                                type="time"
                                value={inlineDraft.start}
                                onChange={(e) => setInlineDraft({ ...inlineDraft, start: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`end-${t.id}`} className="text-xs text-muted-foreground">
                                Ends
                              </Label>
                              <Input
                                id={`end-${t.id}`}
                                type="time"
                                value={inlineDraft.end}
                                onChange={(e) => setInlineDraft({ ...inlineDraft, end: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1" onClick={commitInline}>
                              Save times
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => setInlineDraft(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                          {(() => {
                            const s = hhmmToMins(inlineDraft.start);
                            const e = hhmmToMins(inlineDraft.end);
                            if (e <= s) {
                              return (
                                <p className="flex items-center gap-1 text-xs text-destructive">
                                  <X className="size-3" /> End must be after start
                                </p>
                              );
                            }
                            return (
                              <p className="text-xs text-muted-foreground">New window: {fmtWindow(s, e)}</p>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )
        )
      )}

      {/* Floating add button */}
      <Button
        size="icon"
        onClick={openNew}
        aria-label="Add task"
        className="fixed right-5 bottom-24 z-40 size-14 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/40 transition-transform hover:scale-105 active:scale-95"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </Button>

      {/* Create / edit dialog */}
      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>
              You can only check this off between the start and end time.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-name">Name</Label>
                <Input
                  id="task-name"
                  placeholder="Drink water"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Icon</Label>
                <IconPicker value={form.icon} onChange={(ic) => setForm({ ...form, icon: ic })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-start">Starts</Label>
                  <Input
                    id="task-start"
                    type="time"
                    value={form.start}
                    onChange={(e) => setForm({ ...form, start: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-end">Ends</Label>
                  <Input
                    id="task-end"
                    type="time"
                    value={form.end}
                    onChange={(e) => setForm({ ...form, end: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {TASK_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      aria-label={`Color ${c}`}
                      className={cn(
                        "size-8 rounded-full transition-transform",
                        form.color === c
                          ? "scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background"
                          : "hover:scale-105"
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Repeat</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      ["everyday", "Every day"],
                      ["weekdays", "Weekdays"],
                      ["weekend", "Weekend"],
                      ["custom", "Custom"],
                    ] as [RepeatPreset, string][]
                  ).map(([p, label]) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => applyPreset(p)}
                      disabled={p === "custom" && activePreset !== "custom"}
                      className={cn(
                        "rounded-md border px-1 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                        activePreset === p
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {DAYS.map((d) => {
                    const on = (form.days & (1 << d.bit)) !== 0;
                    return (
                      <button
                        key={d.bit}
                        type="button"
                        onClick={() => setForm({ ...form, days: form.days ^ (1 << d.bit) })}
                        className={cn(
                          "h-9 flex-1 rounded-md border text-xs font-medium transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-secondary/50 text-muted-foreground"
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Repeats {maskLabel(form.days).toLowerCase()}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!form?.name.trim()}>
              {editing ? "Save" : "Add task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grouping menu */}
      <Dialog open={viewMenuOpen} onOpenChange={setViewMenuOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Organize routine</DialogTitle>
            <DialogDescription>
              How should the list be grouped? Tap any day in the strip to see just that day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(
              [
                ["week", "All week", "One list — every task, every day"],
                ["split", "Weekdays & weekend", "Two sections: Mon–Fri, then Sat–Sun"],
              ] as [RoutineView, string, string][]
            ).map(([v, title, desc]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => {
                  setView(v);
                  setViewMenuOpen(false);
                }}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  view === v
                    ? "border-primary bg-primary/5"
                    : "border-border bg-secondary/40 hover:bg-secondary/60"
                )}
              >
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </button>
            ))}
            <div className="flex items-center justify-center gap-1 pt-1">
              {DAYS.map((d) => (
                <button
                  key={d.bit}
                  type="button"
                  onClick={() => {
                    setView(d.bit);
                    setViewMenuOpen(false);
                  }}
                  className="h-8 w-8 rounded-md bg-secondary/50 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
                >
                  {d.label[0]}
                </button>
              ))}
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              …or jump straight to a single day above
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              "{deleteTarget?.name}" will be removed from your routine. Past history stays.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteTarget) await deleteTask(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Small pill switch so this file stays self-contained. */
function EditModeSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-input"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform",
          on && "translate-x-5"
        )}
      />
    </button>
  );
}
