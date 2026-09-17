import { useState } from "react";
import { Moon, Sun, Bell, Sunrise, Globe, Download } from "lucide-react";
import { useApp } from "@/lib/store";
import { isValidZone, zonedParts } from "@/lib/time";
import type { Settings } from "@/types";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const QUICK_ZONES = [
  "device",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function zonePreview(zone: string): string {
  const p = zonedParts(zone);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const ampm = p.hour >= 12 ? "PM" : "AM";
  return `${h12}:${String(p.minute).padStart(2, "0")} ${ampm}`;
}

function zoneLabel(zone: string): string {
  return zone === "device" ? "Device time" : zone;
}

export function SettingsScreen() {
  const { settings, saveSettings } = useApp();
  const [boundaryDraft, setBoundaryDraft] = useState<Settings | null>(null);
  const [tzDraft, setTzDraft] = useState<string | null>(null);
  const [tzError, setTzError] = useState<string | null>(null);

  const commitBoundary = async () => {
    if (boundaryDraft) await saveSettings(boundaryDraft);
    setBoundaryDraft(null);
  };

  const doExport = async () => {
    try {
      const { api } = await import("@/lib/api");
      const json = await api.exportData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `grounded-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* export unavailable in this runtime */
    }
  };

  const commitZone = async () => {
    if (tzDraft === null) return;
    if (!isValidZone(tzDraft)) {
      setTzError("Unknown time zone — try an IANA name like Asia/Kolkata");
      return;
    }
    await saveSettings({ ...settings, time_zone: tzDraft });
    setTzDraft(null);
    setTzError(null);
  };

  return (
    <div className="space-y-4 px-4 pt-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Make it yours</p>
      </div>

      {/* Appearance */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
              {settings.theme === "dark" ? <Moon className="size-5" /> : <Sun className="size-5" />}
            </div>
            <div>
              <p className="font-medium">Dark mode</p>
              <p className="text-xs text-muted-foreground">
                {settings.theme === "dark" ? "On — easy on night eyes" : "Off — bright and clear"}
              </p>
            </div>
          </div>
          <Switch
            checked={settings.theme === "dark"}
            onCheckedChange={(v) =>
              void saveSettings({ ...settings, theme: v ? "dark" : "light" })
            }
          />
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
              <Bell className="size-5" />
            </div>
            <div>
              <p className="font-medium">Window reminders</p>
              <p className="text-xs text-muted-foreground">Notify when a task window opens</p>
            </div>
          </div>
          <Switch
            checked={settings.notifications_enabled}
            onCheckedChange={(v) =>
              void saveSettings({ ...settings, notifications_enabled: v })
            }
          />
        </div>
      </div>

      {/* Time zone */}
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-4 text-left"
        onClick={() => {
          setTzError(null);
          setTzDraft(settings.time_zone);
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
            <Globe className="size-5" />
          </div>
          <div>
            <p className="font-medium">Time zone</p>
            <p className="text-xs text-muted-foreground">
              {settings.time_zone === "device"
                ? "Follows this device — changes when you travel"
                : `Pinned to ${settings.time_zone} — travel-proof`}
            </p>
          </div>
        </div>
        <span className="text-sm font-semibold text-primary">
          {zonePreview(settings.time_zone)}
        </span>
      </button>

      {/* Day boundary */}
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-4 text-left"
        onClick={() => setBoundaryDraft({ ...settings })}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
            <Sunrise className="size-5" />
          </div>
          <div>
            <p className="font-medium">Day starts at</p>
            <p className="text-xs text-muted-foreground">
              {settings.day_start_hour === 0
                ? "Midnight (default)"
                : `${fmtHour(settings.day_start_hour)} — tasks before this count to yesterday`}
            </p>
          </div>
        </div>
        <span className="text-sm font-semibold text-primary">
          {fmtHour(settings.day_start_hour)}
        </span>
      </button>

      {/* Data export */}
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-4 text-left"
        onClick={doExport}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
            <Download className="size-5" />
          </div>
          <div>
            <p className="font-medium">Export data</p>
            <p className="text-xs text-muted-foreground">
              Save a JSON backup of your full history
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">.json</span>
      </button>

      <p className="px-1 text-xs text-muted-foreground">
        Everything is stored locally on this device. No accounts, no cloud.
      </p>

      {/* Time zone picker */}
      <Dialog open={tzDraft !== null} onOpenChange={(o) => !o && setTzDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Time zone</DialogTitle>
            <DialogDescription>
              Keep it on device time, or pin your routine to a zone so it stays
              put when you travel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ZONES.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => {
                    setTzError(null);
                    setTzDraft(z);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    tzDraft === z
                      ? "border-primary bg-primary/10"
                      : "border-border bg-secondary/50"
                  )}
                >
                  <span className="truncate">{zoneLabel(z)}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {zonePreview(z)}
                  </span>
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tz-custom">Or enter any IANA zone</Label>
              <Input
                id="tz-custom"
                placeholder="e.g. Asia/Kolkata"
                value={tzDraft ?? ""}
                onChange={(e) => {
                  setTzError(null);
                  setTzDraft(e.target.value);
                }}
              />
              {tzError && <p className="text-xs text-destructive">{tzError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTzDraft(null)}>
              Cancel
            </Button>
            <Button onClick={commitZone}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day boundary picker */}
      <Dialog open={boundaryDraft !== null} onOpenChange={(o) => !o && setBoundaryDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>When does your day start?</DialogTitle>
            <DialogDescription>
              Useful if you often finish your day after midnight.
            </DialogDescription>
          </DialogHeader>
          {boundaryDraft && (
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() =>
                    setBoundaryDraft({ ...boundaryDraft, day_start_hour: h })
                  }
                  className={cn(
                    "rounded-lg border py-2 text-sm font-medium transition-colors",
                    boundaryDraft.day_start_hour === h
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary/50 text-muted-foreground"
                  )}
                >
                  {fmtHour(h)}
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoundaryDraft(null)}>
              Cancel
            </Button>
            <Button onClick={commitBoundary}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}
