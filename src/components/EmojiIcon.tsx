import { useEffect, useState } from "react";
import { cachedEmojiUrl, loadEmojiUrl } from "@/lib/emoji";
import { cn } from "@/lib/utils";

/**
 * Renders an emoji as a Twemoji SVG (consistent on every OS).
 * Falls back to the native glyph until/unless the SVG is available.
 * Size it with explicit size classes, e.g. <EmojiIcon emoji="💧" className="size-6" />.
 */
export function EmojiIcon({
  emoji,
  className,
  fallbackClassName,
}: {
  emoji: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [src, setSrc] = useState<string | null>(() => cachedEmojiUrl(emoji));

  useEffect(() => {
    let alive = true;
    setSrc(cachedEmojiUrl(emoji));
    void loadEmojiUrl(emoji).then((url) => {
      if (alive && url) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [emoji]);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className={cn("inline-block select-none object-contain", className)}
      />
    );
  }
  return <span className={cn("select-none", fallbackClassName, className)}>{emoji}</span>;
}
