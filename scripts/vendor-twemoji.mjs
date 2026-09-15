/**
 * Vendors the Twemoji SVGs used by the icon catalog into public/emojis/,
 * so EmojiIcon can render crisp, consistent emoji fully offline.
 * Run automatically via `npm run vendor:emoji` (needs network once).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/";
const OUT = "public/emojis";

mkdirSync(OUT, { recursive: true });

// Extract every emoji sequence from the icon catalog source.
const src = readFileSync("src/lib/icons.ts", "utf8");
const re =
  /[\u{1F000}-\u{1FAFF}\u{1FB00}-\u{1FBFF}\u2600-\u27BF\u2B00-\u2B55\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2900-\u297F\u24C2\u2122\u2139\u203C\u2049\u20E3\u3030\u303D\u3297\u3299\u00A9\u00AE\uFE0F\u200D]+/gu;

const seen = new Set();
for (const m of src.match(re) ?? []) {
  // A sequence is an emoji if it has at least one non-modifier char.
  const core = m.replace(/[\uFE0F\u200D]/g, "");
  if (core.length === 0 || !/\p{L}|\p{N}|\p{S}/u.test(m)) continue;
  seen.add(m);
}

/** Twemoji filename: drop FE0F unless the sequence has a ZWJ. */
function fileName(e) {
  const s = e.includes("\u200D") ? e : e.replace(/\uFE0F/g, "");
  const codes = [...s].map((c) => c.codePointAt(0).toString(16));
  return `${codes.join("-")}.svg`;
}

const files = [...new Set([...seen].map(fileName))].sort();
const have = new Set(readdirSync(OUT));
const missing = files.filter((f) => !have.has(f));

console.log(`catalog uses ${files.length} glyphs · ${have.size} vendored · ${missing.length} to fetch`);

const CONCURRENCY = 12;
let ok = 0;
let fail = 0;
const failed = [];

async function pool(items, worker) {
  let i = 0;
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

await pool(missing, async (file) => {
  try {
    const res = await fetch(SOURCE + file);
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(OUT, file), buf);
    ok++;
  } catch (e) {
    fail++;
    failed.push(file);
  }
});

console.log(`downloaded ${ok}, failed ${fail}`);
if (failed.length) {
  console.log("missing (will fall back to native glyph):", failed.slice(0, 20).join(" "));
}
