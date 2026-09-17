import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { ICON_CATEGORIES, POPULAR_ICONS, PHYSICAL_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { EmojiIcon } from "@/components/EmojiIcon";

interface Props {
  value: string;
  onChange: (icon: string) => void;
  /** "physical" swaps the popular grid to the workout set. */
  kind?: "daily" | "physical";
}

export function IconPicker({ value, onChange, kind = "daily" }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const popular = kind === "physical" ? PHYSICAL_ICONS : POPULAR_ICONS;

  // Category names double as searchable text; icons match themselves.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICON_CATEGORIES;
    return ICON_CATEGORIES.map((c) => ({
      name: c.name,
      icons: c.name.toLowerCase().includes(q)
        ? c.icons
        : c.icons.filter((i) => i.includes(q)),
    })).filter((c) => c.icons.length > 0);
  }, [query]);

  return (
    <div className="space-y-2">
      {/* Popular grid (default view) — set depends on task kind */}
      {!showAll && (
        <div className="grid grid-cols-8 gap-1.5">
          {popular.map((ic) => (
            <IconCell
              key={`p-${ic}`}
              icon={ic}
              selected={value === ic}
              onClick={() => onChange(ic)}
            />
          ))}
        </div>
      )}

      {/* Show all: search + full categorized catalog */}
      {showAll && (
        <>
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder="Search categories or emoji…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-border p-2">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nothing matches "{query}"
              </p>
            )}
            {filtered.map((cat) => (
              <div key={cat.name}>
                <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {cat.name}
                </p>
                <div className="grid grid-cols-8 gap-1.5">
                  {cat.icons.map((ic) => (
                    <IconCell
                      key={`${cat.name}-${ic}`}
                      icon={ic}
                      selected={value === ic}
                      onClick={() => onChange(ic)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setShowAll((s) => !s)}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        {showAll ? (
          <>
            <ChevronUp className="size-3.5" /> Show popular only
          </>
        ) : (
          <>
            <ChevronDown className="size-3.5" /> Show all icons
          </>
        )}
      </button>
    </div>
  );
}

function IconCell({
  icon,
  selected,
  onClick,
}: {
  icon: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex aspect-square items-center justify-center rounded-lg border transition-colors",
        selected
          ? "border-primary bg-primary/15 ring-1 ring-primary"
          : "border-border bg-secondary/50 hover:bg-secondary"
      )}
    >
      <EmojiIcon emoji={icon} className="size-5" fallbackClassName="text-lg leading-none" />
    </button>
  );
}
