# 🌱 Grounded

A local-first **daily routine accountability app**. Build your routine with time windows — *"Drink water, 8:00–8:30 AM"* — and check tasks off **only while their window is open**. Miss it and the task is locked as **failed** for that day. No accounts, no cloud, no mercy.

## Features

- ⏰ **Time-window tasks** — checkable only between start and end time, enforced by the Rust core (not just the UI)
- ❌ **Strict failure** — a window that closes unchecked flips to `failed` automatically, even if the app was closed the whole time
- 🔁 **Flexible routine** — per-task emoji icon, start/end time, and which weekdays it repeats on
- 🌅 **Day boundary** — optionally treat 1–6 AM as "still yesterday" (great for late nights)
- 🌍 **Time zone** — follow the device, or pin your routine to any IANA zone (DST-correct, travel-proof; the whole engine — windows, rollover, day boundary — runs in the chosen zone)
- 🔥 **Streaks & history** — 12-week heatmap, perfect days, per-day completion
- 🔔 **Reminders** — a notification when each task's window opens (Android channel with vibration)
- 🎨 **Dark-first design** with standout emerald / cyan / rose accents (light mode included)
- 📴 **100% local** — SQLite database in the app's private data dir, nothing leaves the device

## Stack

| Layer | Tech |
|---|---|
| App shell | Tauri 2 (Android + desktop) |
| Backend | Rust — rule engine + SQLite (`rusqlite`, bundled) |
| Frontend | React 19 + TypeScript + Vite |
| UI | shadcn/ui components + Tailwind CSS v4 (OKLCH theme) |
| Notifications | tauri-plugin-notification (scheduled, TS-side) |

## The rules (enforced in Rust, `src-tauri/src/lib.rs`)

1. Checking off succeeds **only** if the device time is inside the task's window — `[start, end)`
2. The exact close minute counts as **failed** (`end_minute <= now`)
3. Every query syncs the day first: creates fresh instances on rollover, seeds missed past days as failed, auto-fails overdue windows — so state is always correct even after days closed
4. History is locked: yesterday can never be edited
5. Days with zero scheduled tasks never break your streak; today (still in progress) neither counts nor breaks it

## Verified status

- ✅ `tsc --noEmit` + `vite build` — clean
- ✅ `cargo test` — 9/9 passing (window rules, boundaries, rollover, weekday mask, day boundary, streak)
- ✅ `cargo clippy` — zero warnings

## Run it

### Desktop (fastest way to see it working)

```bash
npm install
npm run tauri dev        # desktop window with the real app
```

(Plain `npm run dev` opens it in a browser for UI preview only — data calls are disabled there.)

### Android — one-time setup on Windows

1. **Rust** — already installed ✅ (add the target):
   ```bash
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```
2. **Android Studio** — install from developer.android.com/studio. In *More Actions → SDK Manager*:
   - SDK Platforms: check **Android 14 (API 34)**
   - SDK Tools: check **Android SDK Build-Tools**, **NDK (Side by side)**, **Android SDK Platform-Tools**, **Android SDK Command-line Tools**
3. **Environment variables** (System Properties → Environment Variables):
   - `JAVA_HOME` = `C:\Program Files\Android\Android Studio\jbr`
   - `ANDROID_HOME` = `C:\Users\<you>\AppData\Local\Android\Sdk`
   - `NDK_HOME` = `%ANDROID_HOME%\ndk\<version>` (e.g. `...\ndk\26.3.11579264`)
   - Add `%ANDROID_HOME%\platform-tools` to `Path`
4. **Phone** — Settings → About phone → tap *Build number* 7× → Developer options → enable **USB debugging**. Connect via USB and accept the debugging prompt.

### Android — run it

```bash
npm run tauri android init   # once (generates gen/android)
npm run tauri android dev    # installs + launches on the connected phone
npm run tauri android build  # release APK in src-tauri/gen/android/.../outputs/apk/
```

> First Android build compiles ~15 minutes (four Rust targets); later builds are much faster.

## Project layout

```
├── src/                  # React frontend
│   ├── lib/              # api bridge, store, time helpers, notification scheduling
│   ├── screens/          # Today · Routine · History · Settings
│   └── components/       # TaskCard, ProgressRing, shadcn ui/
├── src-tauri/            # Rust backend
│   └── src/lib.rs        # SQLite schema, rule engine, Tauri commands, tests
├── scripts/gen-icon.mjs  # zero-dependency app icon generator
└── assets/app-icon.png
```

## Notes

- **Where's my data?** On Android: private app storage (`/data/data/app.grounded.routine/`), wiped only if you uninstall or clear app data.
- **Notifications** are scheduled 7 days ahead from the open device; opening the app or editing a task re-schedules them. The Rust core enforces the actual accountability rules regardless of notification state.
- The default day boundary is midnight; change it in Settings if your routine runs past 12 AM.
- **Time zone**: "Device time" (default) follows whatever the device is set to; pinning a zone like `Asia/Kolkata` anchors windows, auto-fail, and day rollover to that zone with full DST handling (Rust: `chrono-tz`, UI: `Intl`).
