# Grounded — Progress Notes

_Last updated: Sept 15, evening. Resume point at the bottom._

## What the app is
Local-first daily routine accountability app (Tauri 2 + Rust + React 19 + TS + shadcn/ui + Tailwind v4).
Tasks live in time windows ("Drink water 8:00–8:30"); check-off only counts inside the window,
missed windows auto-fail, history is immutable. SQLite on device via rusqlite. No network at runtime.

## Current state (all green)
- `npm run build` (tsc + vite) ✅
- `cargo test` **11/11** ✅ · `cargo clippy` **0 warnings** ✅
- Desktop dev loop: `npm run tauri dev` · browser preview: `npm run dev` (demo backend in localStorage, same rules)

## Feature map
- **Today tab**: greeting + **live clock (seconds tick)** in the chosen time zone, date, streak badge,
  progress ring, stats strip, **filter pills (All/Morning/Afternoon/Evening with counts)**,
  grouped checklist with colored active-card glow + live countdowns, circular colored check buttons,
  strict rules (Missed / locked after close).
- **Routine tab**: edit mode (inline time editor), **Mon–Sun day strip with per-day counts + today dot**,
  grouping menu (**All week / Weekdays & weekend split / single-day view**) with separator headers,
  **FAB add button**, per-task **color swatches** (10-color palette), **repeat presets**
  (Every day / Weekdays / Weekend / Custom) + individual day toggles, icon picker with **Show all** +
  search, full-screen delete confirm.
- **History tab**: 12-week heatmap, avg completion, perfect days, streak (refreshes on open).
- **Settings**: dark/light, notifications on/off, day boundary (0–6), **time zone (device or any IANA zone,
  live preview clock, validated in Rust)**.

## Recent session (this round)
1. **Per-task colors** — new `color` column (`#rrggbb`, Rust-validated), auto-migration for old DBs
   (Rust + demo backend), color picker in task editor, colored cards/tiles/checks in Today + Routine.
   New files: `src/lib/colors.ts` (TASK_COLORS, safeColor, withAlpha).
2. **Twemoji icon library** — every catalog emoji renders as an SVG (Twemoji, the set Discord/Slack use),
   consistent across platforms. 435 SVGs vendored into `public/emojis/` by `npm run vendor:emoji`
   (one-time network step, like npm install; re-run after editing `src/lib/icons.ts`).
   Runtime is fully offline: fetched once, cached in localStorage as data URLs.
   New files: `src/lib/emoji.ts`, `src/components/EmojiIcon.tsx`, `scripts/vendor-twemoji.mjs`.
   Fallback to native glyph if a file is ever missing.
3. **Design pass** (from the Habitly reference): filter pills on Today, FAB on Routine, colored gradient
   active cards, rounded **Nunito** font (Google Fonts link in index.html; system fallbacks if offline),
   larger radii, nav active indicator bar.
4. **Earlier this thread**: pardons requested then **dropped by user decision** (too confusing).
   Day strip + grouping + separators + presets shipped. Live clock shipped.

## Verification log (latest run)
- tsc + vite build ✅ · cargo test 11/11 ✅ · clippy 0 ✅
- Live preview walkthrough: clock ticking, pills filter, routine views switch, color picker renders,
  dialog save/cancel OK, console clean.

## NEXT (resume here)
1. ~~Production build~~ **DONE** — installers at
   `src-tauri/target/release/bundle/nsis/Grounded_0.1.0_x64-setup.exe` and
   `src-tauri/target/release/bundle/msi/Grounded_0.1.0_x64_en-US.msi`.
   (If a future build fails with "output path is not a writable directory": `cargo clean --release`, rebuild.)
2. **Android port — IN PROGRESS** (user's phone is Android):
   - `rustup target add` for the 4 Android targets: 2/4 installed, download was still running
     when session paused (check with `rustup target list --installed | grep android`).
   - Created `scripts/android-env.ps1` — auto-locates SDK/NDK/JDK and wraps any
     `tauri android …` command with the right env. Usage:
     `powershell -File scripts\android-env.ps1 tauri android init`.
   - **User must install Android Studio** (Standard setup + NDK via SDK Manager) and enable
     USB debugging on the phone — neither done yet as of this note.
   - Then: init → `android-env.ps1 tauri android init` · device test → `tauri android dev` ·
     APK → `tauri android build --apk` (output in `gen/android` build artifacts; side-load the APK).
   - First Android build compiles the whole Rust crate per target — expect 10–20 min.
3. Optional polish candidates: per-task stats screen (tap a task → its own history),
   restart ritual screen after a failed day, recent-emoji row in the picker,
   bundle Nunito locally (woff2) to avoid the Google Fonts fetch in the packaged app.

## Gotchas learned
- Freebuff restarts kill the dev server — re-run `npm run dev`, then `register_preview` with the PID
  from `netstat -ano | grep :1420`.
- Preview screenshots can fail with a webview compositing error; `preview_snapshot` still works.
- In preview automation, always re-snapshot before each click (stale uids click the wrong node).
- Demo data lives in localStorage key `grounded-demo-v2`; bump the version suffix in
  `src/lib/demoBackend.ts` if old seeded data misbehaves.
