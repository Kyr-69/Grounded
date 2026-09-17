import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Floating "+XP" pop that rises from the bottom of the screen after a
 * check-off. Gold for physical tasks (big rewards), neutral for daily.
 * Auto-dismisses after ~1.4s.
 */
export function XpPop() {
  const { xpPop, dismissXpPop } = useApp();

  useEffect(() => {
    if (!xpPop) return;
    const id = setTimeout(dismissXpPop, 1400);
    return () => clearTimeout(id);
  }, [xpPop, dismissXpPop]);

  if (!xpPop) return null;

  return (
    <div
      key={xpPop.id}
      className={cn(
        "pointer-events-none fixed left-1/2 z-50 -translate-x-1/2 animate-[xp-pop_1.4s_ease-out_forwards]",
        "rounded-full border px-4 py-1.5 text-sm font-black shadow-xl backdrop-blur",
        xpPop.physical
          ? "border-warning/60 bg-warning/20 text-warning"
          : "border-primary/50 bg-primary/15 text-primary-foreground"
      )}
      style={{ bottom: 132 }}
      role="status"
      aria-live="polite"
    >
      +{xpPop.amount} XP {xpPop.physical ? "💪" : "✨"}
    </div>
  );
}
