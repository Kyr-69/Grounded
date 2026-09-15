import { useEffect, useState } from "react";
import { zonedParts } from "@/lib/time";
import { cn } from "@/lib/utils";

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Live HH:MM(:SS) clock in the given zone, used in the Today header. */
export function LiveClock({ zone, className }: { zone: string; className?: string }) {
  useNow();
  const p = zonedParts(zone);
  const mm = String(p.minute).padStart(2, "0");
  const ss = String(p.seconds).padStart(2, "0");
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 font-mono tabular-nums", className)}>
      <span className="text-lg font-semibold tracking-tight text-foreground">
        {p.hour}:{mm}
      </span>
      <span className="text-[10px] text-muted-foreground">{ss}</span>
    </span>
  );
}
