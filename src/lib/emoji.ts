/**
 * Emoji rendering via Twemoji (the open-source set used by Discord/Slack),
 * so every icon looks identical on every platform instead of depending on
 * the OS emoji font. SVGs come from the local vendored set in /public/emojis
 * (download at install time by `npm run vendor:emoji`) and are cached in
 * localStorage as data URLs — the app stays 100% offline at runtime.
 *
 * If a glyph was never vendored (or fetch fails), we fall back to the
 * native emoji character.
 */

const CACHE_PREFIX = "twemoji:";
const memory = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

/**
 * Twemoji asset filename for an emoji, mirroring the official converter:
 * keep U+FE0F only when the sequence contains a zero-width joiner,
 * join remaining codepoints with "-".
 */
export function twemojiFile(emoji: string): string {
  const hasZWJ = emoji.includes("\u200D");
  const src = hasZWJ ? emoji : emoji.replace(/\uFE0F/g, "");
  const codes: string[] = [];
  for (const ch of Array.from(src)) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp === 0xfe0f) continue;
    codes.push(cp.toString(16));
  }
  return `${codes.join("-")}.svg`;
}

async function loadUrl(emoji: string): Promise<string | null> {
  const file = twemojiFile(emoji);
  const hit = memory.get(file);
  if (hit) return hit;

  const pending = inflight.get(file);
  if (pending) return pending;

  const job = (async () => {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + file);
      if (cached) {
        memory.set(file, cached);
        return cached;
      }
      const res = await fetch(`emojis/${file}`);
      if (!res.ok) return null;
      const blob = await res.blob();
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (!dataUrl) return null;
      memory.set(file, dataUrl);
      try {
        localStorage.setItem(CACHE_PREFIX + file, dataUrl);
      } catch {
        /* quota — memory cache still works */
      }
      return dataUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(file);
    }
  })();

  inflight.set(file, job);
  return job;
}

/** Synchronous best-effort lookup (already-cached glyphs only). */
export function cachedEmojiUrl(emoji: string): string | null {
  return memory.get(twemojiFile(emoji)) ?? null;
}

export function loadEmojiUrl(emoji: string): Promise<string | null> {
  return loadUrl(emoji);
}
