import { useState } from "react";
import {
  CalendarCheck,
  ListTodo,
  Settings as SettingsIcon,
  Trophy,
  Zap,
} from "lucide-react";
import { AppProvider, useApp } from "@/lib/store";
import { NotificationsManager } from "@/components/NotificationsManager";
import { ActiveTaskBar } from "@/components/ActiveTaskBar";
import { TodayScreen } from "@/screens/TodayScreen";
import { RoutineScreen } from "@/screens/RoutineScreen";
import { RankScreen } from "@/screens/RankScreen";
import { ConsistencyScreen } from "@/screens/ConsistencyScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { cn } from "@/lib/utils";
import type { Tab } from "@/types";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "today", label: "Today", icon: ListTodo },
  { id: "routine", label: "Routine", icon: CalendarCheck },
  { id: "rank", label: "Rank", icon: Trophy },
  { id: "consistency", label: "Consistency", icon: Zap },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function Shell() {
  const { ready, error } = useApp();
  const [tab, setTab] = useState<Tab>("today");

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading your day…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <NotificationsManager />

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-20">
        {tab === "today" && <TodayScreen onGoToRoutine={() => setTab("routine")} />}
        {tab === "routine" && <RoutineScreen />}
        {tab === "rank" && <RankScreen />}
        {tab === "consistency" && <ConsistencyScreen />}
        {tab === "settings" && <SettingsScreen />}
      </main>

      <ActiveTaskBar />

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("size-5 transition-transform", active && "scale-110 drop-shadow-[0_0_6px_var(--primary)]")} />
                {active && (
                  <span className="absolute -top-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                )}
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
