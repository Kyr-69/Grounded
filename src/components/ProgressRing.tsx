import { cn } from "@/lib/utils";

export function ProgressRing({
  value,
  size = 72,
  stroke = 7,
  className,
  children,
}: {
  value: number; // 0..100
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          className={cn("transition-all duration-500", value >= 100 ? "stroke-success" : "stroke-primary")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
