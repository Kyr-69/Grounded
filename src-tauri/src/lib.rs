use std::sync::Mutex;

use chrono::{Datelike, Duration, Local, NaiveDate, NaiveDateTime, Timelike, Utc};
use chrono_tz::Tz;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

// ---------------------------------------------------------------------------
// Data model — field names match the TypeScript types (snake_case)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
struct RoutineTask {
    id: i64,
    name: String,
    icon: String,
    color: String, // hex like #34d399, used for the card accent
    start_minute: i64,
    end_minute: i64,
    days_mask: i64, // bit 0 = Monday ... bit 6 = Sunday
    created_at: String,
    kind: String, // "daily" | "physical" — physical tasks earn scaled XP
}

#[derive(Debug, Deserialize)]
struct TaskInput {
    name: String,
    icon: String,
    color: String,
    start_minute: i64,
    end_minute: i64,
    days_mask: i64,
    kind: String,
}

#[derive(Debug, Serialize, Clone)]
struct TaskInstance {
    id: i64,
    task_id: i64,
    date: String,
    status: String, // "pending" | "done" | "failed"
    checked_at: Option<String>,
    task: RoutineTask,
}

#[derive(Debug, Serialize, Default, Clone)]
struct DayStats {
    total: i64,
    done: i64,
    failed: i64,
    pending: i64,
}

#[derive(Debug, Serialize)]
struct DayPayload {
    date: String,
    vacation: bool,
    instances: Vec<TaskInstance>,
    stats: DayStats,
}

#[derive(Debug, Serialize)]
struct HistoryEntry {
    date: String,
    total: i64,
    done: i64,
    failed: i64,
    completion_pct: i64,
    xp: i64,
    vacation: bool,
    workout_minutes: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Settings {
    theme: String, // "dark" | "light"
    day_start_hour: i64,
    notifications_enabled: bool,
    time_zone: String, // "device" or an IANA name like "Asia/Kolkata"
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            day_start_hour: 0,
            notifications_enabled: true,
            time_zone: "device".into(),
        }
    }
}

#[derive(Debug, Serialize)]
struct InstanceWithStats {
    instance: TaskInstance,
    stats: DayStats,
}

struct Db(Mutex<Connection>);

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS tasks (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL,
            icon         TEXT NOT NULL DEFAULT '✅',
            color        TEXT NOT NULL DEFAULT '#34d399',
            start_minute INTEGER NOT NULL,
            end_minute   INTEGER NOT NULL,
            days_mask    INTEGER NOT NULL DEFAULT 127,
            created_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS task_instances (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            date       TEXT NOT NULL,
            status     TEXT NOT NULL DEFAULT 'pending',
            checked_at TEXT,
            UNIQUE(task_id, date)
        );
        CREATE INDEX IF NOT EXISTS idx_instances_date ON task_instances(date);

        CREATE TABLE IF NOT EXISTS vacation_days (
            date TEXT PRIMARY KEY,
            reason TEXT NOT NULL DEFAULT ''
        );

        -- XP earned on days that aged out of the history window. Kept forever
        -- so Rank reflects the whole journey, not just the recent 12 weeks.
        CREATE TABLE IF NOT EXISTS xp_bank (
            id      INTEGER PRIMARY KEY CHECK (id = 1),
            base_xp INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS xp_banked_days (
            date TEXT PRIMARY KEY,
            xp   INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS settings (
            id                    INTEGER PRIMARY KEY CHECK (id = 1),
            theme                 TEXT NOT NULL DEFAULT 'dark',
            day_start_hour        INTEGER NOT NULL DEFAULT 0,
            notifications_enabled INTEGER NOT NULL DEFAULT 1,
            time_zone             TEXT NOT NULL DEFAULT 'device'
        );
        INSERT OR IGNORE INTO settings (id) VALUES (1);
        "#,
    )?;

    // Migration for databases created before time zones existed.
    let has_tz: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('settings') WHERE name = 'time_zone'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_tz == 0 {
        let _ = conn.execute(
            "ALTER TABLE settings ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'device'",
            [],
        );
    }

    // Migration for databases created before per-task colors existed.
    let has_color: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'color'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_color == 0 {
        let _ = conn.execute(
            "ALTER TABLE tasks ADD COLUMN color TEXT NOT NULL DEFAULT '#34d399'",
            [],
        );
    }

    // Migration for databases created before daily/physical task kinds existed.
    let has_kind: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'kind'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_kind == 0 {
        let _ = conn.execute(
            "ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'daily'",
            [],
        );
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/// The "routine day" the given moment belongs to, honoring the day boundary.
/// E.g. with day_start_hour = 4, 2:00 AM belongs to the previous day.
fn routine_date(now: NaiveDateTime, day_start_hour: i64) -> NaiveDate {
    (now - Duration::hours(day_start_hour)).date()
}

fn date_str(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

fn now_real_minutes(now: NaiveDateTime) -> i64 {
    now.hour() as i64 * 60 + now.minute() as i64
}

/// Validate a time zone setting: "device" or any IANA name chrono-tz knows.
fn validate_zone(name: &str) -> Result<String, String> {
    if name.is_empty() || name == "device" {
        return Ok("device".into());
    }
    name.parse::<Tz>()
        .map(|_| name.to_string())
        .map_err(|_| format!("Unknown time zone: {name}"))
}

/// Current wall-clock time in the configured time zone.
/// "device" follows whatever the device is set to; a named IANA zone keeps
/// the routine anchored there — travel-proof and DST-correct.
fn active_now(settings: &Settings) -> Result<NaiveDateTime, String> {
    match settings.time_zone.as_str() {
        "device" | "" => Ok(Local::now().naive_local()),
        name => {
            let tz: Tz = name
                .parse()
                .map_err(|_| format!("Unknown time zone: {name}"))?;
            Ok(Utc::now().with_timezone(&tz).naive_local())
        }
    }
}

/// days_mask bit for a date (0 = Monday ... 6 = Sunday)
fn mask_bit(d: NaiveDate) -> i64 {
    d.weekday().num_days_from_monday() as i64
}

fn checked_at_str(now: NaiveDateTime) -> String {
    now.format("%Y-%m-%dT%H:%M:%S").to_string()
}

// ---------------------------------------------------------------------------
// Rule engine: day sync (create instances, auto-fail missed windows)
// ---------------------------------------------------------------------------

fn get_settings(conn: &Connection) -> Settings {
    conn.query_row(
        "SELECT theme, day_start_hour, notifications_enabled, time_zone FROM settings WHERE id = 1",
        [],
        |r| {
            Ok(Settings {
                theme: r.get(0)?,
                day_start_hour: r.get(1)?,
                notifications_enabled: r.get::<_, i64>(2)? != 0,
                time_zone: r.get(3)?,
            })
        },
    )
    .unwrap_or_default()
}

fn has_instances(conn: &Connection, date: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM task_instances WHERE date = ?1 LIMIT 1",
        params![date],
        |_| Ok(()),
    )
    .optional()
    .ok()
    .flatten()
    .is_some()
}

/// Create today's instances from the current routine, or seed a past day's
/// history as failed. Then auto-fail any pending instance whose window
/// has closed. Idempotent.
fn sync_day_at(conn: &Connection, today: NaiveDate, now: NaiveDateTime) {
    let today_s = date_str(today);
    let now_mins = now_real_minutes(now);

    // Vacation days never seed instances and never auto-fail: the day is
    // simply empty, and streak/consistency logic treats it as a rest day.
    if is_vacation(conn, &today_s) {
        let _ = conn.execute(
            "DELETE FROM task_instances WHERE date = ?1 AND status != 'done'",
            params![today_s],
        );
        return;
    }

    if !has_instances(conn, &today_s) {
        if today_s == date_str(routine_date(now, get_settings(conn).day_start_hour)) {
            // Fresh today: pending for every task scheduled on this weekday.
            let _ = conn.execute(
                "INSERT OR IGNORE INTO task_instances (task_id, date, status)
                 SELECT id, ?1, 'pending' FROM tasks WHERE days_mask & (1 << ?2) != 0",
                params![today_s, mask_bit(today)],
            );
        } else {
            // Past day without records: seed history as failed — but only for
            // days on/after the task was created. Accountability starts when
            // the routine starts; we don't retroactively fail days that
            // predate the task.
            let _ = conn.execute(
                "INSERT OR IGNORE INTO task_instances (task_id, date, status)
                 SELECT id, ?1, 'failed' FROM tasks
                 WHERE days_mask & (1 << ?2) != 0 AND substr(created_at, 1, 10) <= ?1",
                params![today_s, mask_bit(today)],
            );
        }
    }

    // Auto-fail pending instances whose windows closed.
    if today_s == date_str(routine_date(now, get_settings(conn).day_start_hour)) {
        let _ = conn.execute(
            "UPDATE task_instances SET status = 'failed'
             WHERE date = ?1 AND status = 'pending'
               AND task_id IN (SELECT id FROM tasks WHERE end_minute <= ?2)",
            params![today_s, now_mins],
        );
    } else {
        let _ = conn.execute(
            "UPDATE task_instances SET status = 'failed' WHERE date = ?1 AND status = 'pending'",
            params![today_s],
        );
    }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

fn load_task(conn: &Connection, id: i64) -> Option<RoutineTask> {
    conn.query_row(
        "SELECT id, name, icon, color, start_minute, end_minute, days_mask, created_at, kind
         FROM tasks WHERE id = ?1",
        params![id],
        |r| {
            Ok(RoutineTask {
                id: r.get(0)?,
                name: r.get(1)?,
                icon: r.get(2)?,
                color: r.get(3)?,
                start_minute: r.get(4)?,
                end_minute: r.get(5)?,
                days_mask: r.get(6)?,
                created_at: r.get(7)?,
                kind: r.get(8)?,
            })
        },
    )
    .optional()
    .ok()
    .flatten()
}

fn day_counts(conn: &Connection, date: &str) -> DayStats {
    let mut stats = DayStats::default();
    conn.query_row(
        "SELECT
            COUNT(*),
            COALESCE(SUM(status = 'done'), 0),
            COALESCE(SUM(status = 'failed'), 0),
            COALESCE(SUM(status = 'pending'), 0)
         FROM task_instances WHERE date = ?1",
        params![date],
        |r| {
            stats.total = r.get(0)?;
            stats.done = r.get(1)?;
            stats.failed = r.get(2)?;
            stats.pending = r.get(3)?;
            Ok(())
        },
    )
    .ok();
    stats
}

fn day_payload(conn: &Connection, date: &str) -> DayPayload {
    let mut stmt = conn
        .prepare(
            "SELECT ti.id, ti.task_id, ti.date, ti.status, ti.checked_at,
                    t.id, t.name, t.icon, t.color, t.start_minute, t.end_minute, t.days_mask, t.created_at, t.kind
             FROM task_instances ti
             JOIN tasks t ON t.id = ti.task_id
             WHERE ti.date = ?1
             ORDER BY t.start_minute, ti.id",
        )
        .expect("prepare day_payload");

    let instances: Vec<TaskInstance> = stmt
        .query_map(params![date], |r| {
            Ok(TaskInstance {
                id: r.get(0)?,
                task_id: r.get(1)?,
                date: r.get(2)?,
                status: r.get(3)?,
                checked_at: r.get(4)?,
                task: RoutineTask {
                    id: r.get(5)?,
                    name: r.get(6)?,
                    icon: r.get(7)?,
                    color: r.get(8)?,
                    start_minute: r.get(9)?,
                    end_minute: r.get(10)?,
                    days_mask: r.get(11)?,
                    created_at: r.get(12)?,
                    kind: r.get(13)?,
                },
            })
        })
        .expect("query day_payload")
        .filter_map(Result::ok)
        .collect();

    DayPayload {
        date: date.to_string(),
        vacation: is_vacation(conn, date),
        stats: day_counts(conn, date),
        instances,
    }
}

// ---------------------------------------------------------------------------
// XP — physical tasks earn by duration, daily tasks are flat
// ---------------------------------------------------------------------------

/// XP earned for completing one task instance.
/// Daily: flat 50. Physical: 1000 XP per hour of window (30m = 500,
/// 1h = 1000, 2h = 2000), rounded to the nearest 50.
fn task_xp(kind: &str, start_minute: i64, end_minute: i64) -> i64 {
    if kind == "physical" {
        let mins = (end_minute - start_minute).max(0);
        // 1000 XP per full hour, rounded to the nearest 50.
        ((mins as f64 / 60.0) * 1000.0 / 50.0).round() as i64 * 50
    } else {
        50
    }
}

/// Minutes of completed physical-task windows on a date (workout volume).
fn day_workout_minutes(conn: &Connection, date: &str) -> i64 {
    conn.query_row(
        "SELECT COALESCE(SUM(t.end_minute - t.start_minute), 0)
         FROM task_instances ti
         JOIN tasks t ON t.id = ti.task_id
         WHERE ti.date = ?1 AND ti.status = 'done' AND t.kind = 'physical'",
        params![date],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

fn is_vacation(conn: &Connection, date: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM vacation_days WHERE date = ?1",
        params![date],
        |_| Ok(()),
    )
    .optional()
    .ok()
    .flatten()
    .is_some()
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_day(state: State<Db>, date: String) -> Result<DayPayload, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let settings = get_settings(&conn);
    let now = active_now(&settings)?;
    let d = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| "invalid date, expected YYYY-MM-DD")?;
    sync_day_at(&conn, d, now);
    Ok(day_payload(&conn, &date))
}

#[tauri::command]
fn check_task(state: State<Db>, instance_id: i64) -> Result<InstanceWithStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let settings = get_settings(&conn);
    let now = active_now(&settings)?;
    let today = routine_date(now, settings.day_start_hour);
    sync_day_at(&conn, today, now);

    let instance = conn
        .query_row(
            "SELECT task_id, date, status, checked_at FROM task_instances WHERE id = ?1",
            params![instance_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("instance not found")?;

    let (task_id, date, status, _checked) = instance;
    if date != date_str(today) {
        return Err("This task belongs to another day — history is locked.".into());
    }
    if status == "failed" {
        return Err("Too late — this window already closed.".into());
    }
    if status == "done" {
        return Err("Already checked off.".into());
    }

    let task = load_task(&conn, task_id).ok_or("task not found")?;
    let now_mins = now_real_minutes(now);
    if now_mins < task.start_minute {
        return Err("Too early — the window is not open yet.".into());
    }
    if now_mins >= task.end_minute {
        return Err("Too late — the window already closed.".into());
    }

    conn.execute(
        "UPDATE task_instances SET status = 'done', checked_at = ?2 WHERE id = ?1",
        params![instance_id, checked_at_str(now)],
    )
    .map_err(|e| e.to_string())?;

    Ok(InstanceWithStats {
        instance: reload_instance(&conn, instance_id).ok_or("reload failed")?,
        stats: day_counts(&conn, &date),
    })
}

#[tauri::command]
fn uncheck_task(state: State<Db>, instance_id: i64) -> Result<InstanceWithStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let settings = get_settings(&conn);
    let now = active_now(&settings)?;
    let today = routine_date(now, settings.day_start_hour);

    let row = conn
        .query_row(
            "SELECT date, status FROM task_instances WHERE id = ?1",
            params![instance_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("instance not found")?;

    let (date, status) = row;
    if status != "done" {
        return Err("Nothing to undo.".into());
    }
    if date != date_str(today) {
        return Err("History is locked.".into());
    }
    conn.execute(
        "UPDATE task_instances SET status = 'pending', checked_at = NULL WHERE id = ?1",
        params![instance_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(InstanceWithStats {
        instance: reload_instance(&conn, instance_id).ok_or("reload failed")?,
        stats: day_counts(&conn, &date),
    })
}

fn reload_instance(conn: &Connection, instance_id: i64) -> Option<TaskInstance> {
    conn.query_row(
        "SELECT ti.id, ti.task_id, ti.date, ti.status, ti.checked_at,
                t.id, t.name, t.icon, t.color, t.start_minute, t.end_minute, t.days_mask, t.created_at
         FROM task_instances ti JOIN tasks t ON t.id = ti.task_id
         WHERE ti.id = ?1",
        params![instance_id],
        |r| {
            Ok(TaskInstance {
                id: r.get(0)?,
                task_id: r.get(1)?,
                date: r.get(2)?,
                status: r.get(3)?,
                checked_at: r.get(4)?,
                task: RoutineTask {
                    id: r.get(5)?,
                    name: r.get(6)?,
                    icon: r.get(7)?,
                    color: r.get(8)?,
                    start_minute: r.get(9)?,
                    end_minute: r.get(10)?,
                    days_mask: r.get(11)?,
                    created_at: r.get(12)?,
                    kind: r.get(13)?,
                },
            })
        },
    )
    .optional()
    .ok()
    .flatten()
}

#[tauri::command]
fn list_tasks(state: State<Db>) -> Result<Vec<RoutineTask>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, icon, color, start_minute, end_minute, days_mask, created_at, kind FROM tasks ORDER BY start_minute")
        .map_err(|e| e.to_string())?;
    let tasks = stmt
        .query_map([], map_task)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    Ok(tasks)
}

fn map_task(r: &rusqlite::Row) -> rusqlite::Result<RoutineTask> {
    Ok(RoutineTask {
        id: r.get(0)?,
        name: r.get(1)?,
        icon: r.get(2)?,
        color: r.get(3)?,
        start_minute: r.get(4)?,
        end_minute: r.get(5)?,
        days_mask: r.get(6)?,
        created_at: r.get(7)?,
        kind: r.get(8)?,
    })
}

fn validate_input(input: &TaskInput) -> Result<(), String> {
    if input.name.trim().is_empty() {
        return Err("Give the task a name.".into());
    }
    if !(0..=1439).contains(&input.start_minute) || !(0..=1439).contains(&input.end_minute) {
        return Err("Times must be within the day.".into());
    }
    if input.end_minute <= input.start_minute {
        return Err("The end time must be after the start time.".into());
    }
    if input.days_mask & !0x7F != 0 || input.days_mask == 0 {
        return Err("Pick at least one day of the week.".into());
    }
    let c = &input.color;
    if c.len() != 7 || !c.starts_with('#') || !c[1..].chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Color must be a hex value like #34d399.".into());
    }
    if input.kind != "daily" && input.kind != "physical" {
        return Err("Task kind must be daily or physical.".into());
    }
    Ok(())
}

#[tauri::command]
fn create_task(state: State<Db>, input: TaskInput) -> Result<RoutineTask, String> {
    validate_input(&input)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let settings = get_settings(&conn);
    let now = active_now(&settings)?;
    conn.execute(
        "INSERT INTO tasks (name, icon, color, start_minute, end_minute, days_mask, created_at, kind)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            input.name.trim(),
            input.icon,
            input.color,
            input.start_minute,
            input.end_minute,
            input.days_mask,
            checked_at_str(now),
            input.kind
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();

    // If today is one of the task's days, give it an instance right away
    // (pending if the window is still open, failed if already closed).
    let today = routine_date(now, get_settings(&conn).day_start_hour);
    let today_s = date_str(today);
    if !has_instances(&conn, &today_s) {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO task_instances (task_id, date, status)
             SELECT id, ?1, 'pending' FROM tasks WHERE days_mask & (1 << ?2) != 0",
            params![today_s, mask_bit(today)],
        );
    } else if input.days_mask & (1 << mask_bit(today)) != 0 {
        let closed = now_real_minutes(now) >= input.end_minute;
        let status = if closed { "failed" } else { "pending" };
        let _ = conn.execute(
            "INSERT OR IGNORE INTO task_instances (task_id, date, status) VALUES (?1, ?2, ?3)",
            params![id, today_s, status],
        );
    }

    load_task(&conn, id).ok_or_else(|| "insert failed".into())
}

#[tauri::command]
fn update_task(state: State<Db>, id: i64, input: TaskInput) -> Result<RoutineTask, String> {
    validate_input(&input)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let settings = get_settings(&conn);
    let now = active_now(&settings)?;
    conn.execute(
        "UPDATE tasks SET name = ?2, icon = ?3, color = ?4, start_minute = ?5, end_minute = ?6, days_mask = ?7, kind = ?8
         WHERE id = ?1",
        params![
            id,
            input.name.trim(),
            input.icon,
            input.color,
            input.start_minute,
            input.end_minute,
            input.days_mask,
            input.kind
        ],
    )
    .map_err(|e| e.to_string())?;

    // Reset today's pending instance to match the new window; keep done/failed.
    let today = routine_date(now, get_settings(&conn).day_start_hour);
    let today_s = date_str(today);
    let _ = conn.execute(
        "DELETE FROM task_instances WHERE task_id = ?1 AND date = ?2 AND status = 'pending'",
        params![id, today_s],
    );
    if input.days_mask & (1 << mask_bit(today)) != 0 {
        let closed = now_real_minutes(now) >= input.end_minute;
        let status = if closed { "failed" } else { "pending" };
        let _ = conn.execute(
            "INSERT OR IGNORE INTO task_instances (task_id, date, status) VALUES (?1, ?2, ?3)",
            params![id, today_s, status],
        );
    }

    load_task(&conn, id).ok_or_else(|| "task not found".into())
}

#[tauri::command]
fn delete_task(state: State<Db>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_vacation(state: State<Db>, date: String, on: bool) -> Result<DayPayload, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if on {
        conn.execute(
            "INSERT OR IGNORE INTO vacation_days (date) VALUES (?1)",
            params![date],
        )
        .map_err(|e| e.to_string())?;
        // Clear the day's non-done instances so the day reads as free.
        let _ = conn.execute(
            "DELETE FROM task_instances WHERE date = ?1 AND status != 'done'",
            params![date],
        );
    } else {
        conn.execute("DELETE FROM vacation_days WHERE date = ?1", params![date])
            .map_err(|e| e.to_string())?;
        // Re-seed today's instances immediately (vacation off = back to work).
        if date == today_str_rust(&conn)? {
            let settings = get_settings(&conn);
            let now = active_now(&settings)?;
            let today = routine_date(now, settings.day_start_hour);
            sync_day_at(&conn, today, now);
        }
    }
    Ok(day_payload(&conn, &date))
}

/// Today's date string honoring the day boundary.
fn today_str_rust(conn: &Connection) -> Result<String, String> {
    let settings = get_settings(conn);
    let now = active_now(&settings)?;
    Ok(date_str(routine_date(now, settings.day_start_hour)))
}

#[tauri::command]
fn get_xp_bank(state: State<Db>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let xp: i64 = conn
        .query_row(
            "SELECT COALESCE((SELECT base_xp FROM xp_bank WHERE id = 1), 0)",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(xp)
}

/// Bank the XP of every day older than `cutoff_date` that isn't banked yet.
/// Each day's base XP (task rewards + perfect-day bonus) is multiplied by
/// `multiplier` — the consistency stage at bank time — and stored forever.
/// Idempotent: banked days are recorded in xp_banked_days.
#[tauri::command]
fn advance_xp_bank(
    state: State<Db>,
    cutoff_date: String,
    multiplier: f64,
) -> Result<(), String> {
    NaiveDate::parse_from_str(&cutoff_date, "%Y-%m-%d")
        .map_err(|_| "invalid cutoff date, expected YYYY-MM-DD")?;
    let mult = if multiplier.is_finite() && multiplier >= 1.0 { multiplier } else { 1.0 };
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute("INSERT OR IGNORE INTO xp_bank (id, base_xp) VALUES (1, 0)", [])
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT date FROM task_instances
             WHERE date < ?1 AND date NOT IN (SELECT date FROM xp_banked_days)
             ORDER BY date",
        )
        .map_err(|e| e.to_string())?;
    let dates: Vec<String> = stmt
        .query_map(params![cutoff_date], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);

    let mut total = 0i64;
    for d in dates {
        let base = day_xp(&conn, &d);
        let granted = (base as f64 * mult).round() as i64;
        conn.execute(
            "INSERT INTO xp_banked_days (date, xp) VALUES (?1, ?2)",
            params![d, granted],
        )
        .map_err(|e| e.to_string())?;
        total += granted;
    }
    if total > 0 {
        conn.execute(
            "UPDATE xp_bank SET base_xp = base_xp + ?1 WHERE id = 1",
            params![total],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Total XP earned on a date: per-task rewards + the 800 perfect-day
/// bonus, all before the consistency multiplier (applied in the UI).
fn day_xp(conn: &Connection, date: &str) -> i64 {
    let mut stmt = match conn.prepare(
        "SELECT t.kind, t.start_minute, t.end_minute FROM task_instances ti
         JOIN tasks t ON t.id = ti.task_id
         WHERE ti.date = ?1 AND ti.status = 'done'",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    let rows: Vec<(String, i64, i64)> = stmt
        .query_map(params![date], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .ok()
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default();

    let s = day_counts(conn, date);
    let mut xp: i64 = rows
        .iter()
        .map(|(kind, start, end)| task_xp(kind, *start, *end))
        .sum();
    if s.total > 0 && s.done == s.total {
        xp += 800; // perfect-day bonus
    }
    xp
}

#[tauri::command]
fn get_history(state: State<Db>, days: i64) -> Result<Vec<HistoryEntry>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let settings = get_settings(&conn);
    let now = active_now(&settings)?;
    let today = routine_date(now, settings.day_start_hour);

    let mut out = Vec::new();
    for i in 0..days.max(1) {
        let d = today - Duration::days(i);
        let ds = date_str(d);
        sync_day_at(&conn, d, now);
        let s = day_counts(&conn, &ds);
        let pct = if s.total > 0 { s.done * 100 / s.total } else { 0 };
        let xp = day_xp(&conn, &ds);
        let vacation = is_vacation(&conn, &ds);
        let workout_minutes = day_workout_minutes(&conn, &ds);
        out.push(HistoryEntry {
            date: ds,
            total: s.total,
            done: s.done,
            failed: s.failed,
            completion_pct: pct,
            xp,
            vacation,
            workout_minutes,
        });
    }
    Ok(out)
}

#[tauri::command]
fn get_streak(state: State<Db>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let settings = get_settings(&conn);
    let now = active_now(&settings)?;
    let today = routine_date(now, settings.day_start_hour);

    let mut streak = 0i64;
    for i in 0..365 {
        let d = today - Duration::days(i);
        let ds = date_str(d);
        sync_day_at(&conn, d, now);
        let s = day_counts(&conn, &ds);
        if s.total == 0 {
            continue; // days without any routine don't break the streak
        }
        if s.failed > 0 {
            break;
        }
        if s.done == s.total {
            streak += 1;
        } else if i == 0 {
            // today still in progress — doesn't break, doesn't count yet
            continue;
        } else {
            break;
        }
    }
    Ok(streak)
}

#[tauri::command]
fn get_settings_cmd(state: State<Db>) -> Result<Settings, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(get_settings(&conn))
}

#[tauri::command]
fn save_settings_cmd(state: State<Db>, settings: Settings) -> Result<(), String> {
    let theme = if settings.theme == "light" { "light" } else { "dark" };
    let boundary = settings.day_start_hour.clamp(0, 6);
    let tz = validate_zone(&settings.time_zone)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE settings SET theme = ?2, day_start_hour = ?3, notifications_enabled = ?4, time_zone = ?5 WHERE id = 1",
        params![theme, boundary, settings.notifications_enabled as i64, tz],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn export_data(state: State<Db>) -> Result<String, String> {
    use serde_json::json;

    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let tasks: Vec<serde_json::Value> = {
        let mut stmt = conn
            .prepare("SELECT id, name, icon, color, start_minute, end_minute, days_mask, created_at, kind FROM tasks ORDER BY id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, i64>(0)?,
                    "name": r.get::<_, String>(1)?,
                    "icon": r.get::<_, String>(2)?,
                    "color": r.get::<_, String>(3)?,
                    "start_minute": r.get::<_, i64>(4)?,
                    "end_minute": r.get::<_, i64>(5)?,
                    "days_mask": r.get::<_, i64>(6)?,
                    "created_at": r.get::<_, String>(7)?,
                    "kind": r.get::<_, String>(8)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        rows
    };

    let instances: Vec<serde_json::Value> = {
        let mut stmt = conn
            .prepare("SELECT id, task_id, date, status, checked_at FROM task_instances ORDER BY date, id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, i64>(0)?,
                    "task_id": r.get::<_, i64>(1)?,
                    "date": r.get::<_, String>(2)?,
                    "status": r.get::<_, String>(3)?,
                    "checked_at": r.get::<_, Option<String>>(4)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        rows
    };

    let settings = get_settings(&conn);

    let banked: Vec<serde_json::Value> = {
        let mut stmt = conn
            .prepare("SELECT date, xp FROM xp_banked_days ORDER BY date")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "date": r.get::<_, String>(0)?,
                    "xp": r.get::<_, i64>(1)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        rows
    };
    let bank_xp: i64 = conn
        .query_row(
            "SELECT COALESCE((SELECT base_xp FROM xp_bank WHERE id = 1), 0)",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(serde_json::to_string_pretty(&json!({
        "app": "Grounded",
        "version": 1,
        "exported_at": chrono::Local::now().to_rfc3339(),
        "settings": settings,
        "tasks": tasks,
        "instances": instances,
        "vacation_days": vacation_days(&conn),
        "xp_bank": bank_xp,
        "xp_banked_days": banked,
    }))
    .map_err(|e| e.to_string())?)
}

fn vacation_days(conn: &Connection) -> Vec<String> {
    let mut stmt = match conn.prepare("SELECT date FROM vacation_days ORDER BY date") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([], |r| r.get::<_, String>(0))
        .ok()
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = Connection::open(dir.join("grounded.db"))?;
            init_db(&conn)?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_day,
            check_task,
            uncheck_task,
            list_tasks,
            create_task,
            update_task,
            delete_task,
            get_history,
            get_streak,
            get_settings_cmd,
            save_settings_cmd,
            export_data,
            set_vacation,
            advance_xp_bank,
            get_xp_bank
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ---------------------------------------------------------------------------
// Tests — the accountability rules
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn
    }

    fn at(y: i32, m: u32, d: u32, h: u32, min: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(y, m, d)
            .unwrap()
            .and_hms_opt(h, min, 0)
            .unwrap()
    }

    fn add_task(conn: &Connection, start: i64, end: i64, mask: i64) -> i64 {
        conn.execute(
            "INSERT INTO tasks (name, icon, start_minute, end_minute, days_mask, created_at)
             VALUES ('Drink water', '💧', ?1, ?2, ?3, '2026-09-14T00:00:00Z')",
            params![start, end, mask],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn status_of(conn: &Connection, task_id: i64, date: &str) -> Option<String> {
        conn.query_row(
            "SELECT status FROM task_instances WHERE task_id = ?1 AND date = ?2",
            params![task_id, date],
            |r| r.get(0),
        )
        .optional()
        .unwrap()
    }

    // A Monday: 2026-09-14. 8:00–8:30 window.
    const MON: (i32, u32, u32) = (2026, 9, 14);

    #[test]
    fn check_succeeds_only_inside_window() {
        let conn = mem_db();
        let id = add_task(&conn, 8 * 60, 8 * 60 + 30, 0b1111111);

        // 7:59 — too early
        sync_day_at(&conn, NaiveDate::from_ymd_opt(MON.0, MON.1, MON.2).unwrap(), at(MON.0, MON.1, MON.2, 7, 59));
        let st = status_of(&conn, id, "2026-09-14").unwrap();
        assert_eq!(st, "pending");

        // 8:15 — inside → done
        sync_day_at(&conn, NaiveDate::from_ymd_opt(MON.0, MON.1, MON.2).unwrap(), at(MON.0, MON.1, MON.2, 8, 15));
        conn.execute(
            "UPDATE task_instances SET status='done', checked_at='x' WHERE task_id=?1 AND date='2026-09-14'",
            params![id],
        ).unwrap();
        assert_eq!(status_of(&conn, id, "2026-09-14").unwrap(), "done");
    }

    #[test]
    fn missed_window_becomes_failed() {
        let conn = mem_db();
        let id = add_task(&conn, 8 * 60, 8 * 60 + 30, 0b1111111);
        let now = at(MON.0, MON.1, MON.2, 9, 0); // 30 min past close
        sync_day_at(&conn, NaiveDate::from_ymd_opt(MON.0, MON.1, MON.2).unwrap(), now);
        assert_eq!(status_of(&conn, id, "2026-09-14").unwrap(), "failed");
    }

    #[test]
    fn window_boundary_exact_close_fails() {
        let conn = mem_db();
        let id = add_task(&conn, 8 * 60, 8 * 60 + 30, 0b1111111);
        let now = at(MON.0, MON.1, MON.2, 8, 30); // exactly at close
        sync_day_at(&conn, NaiveDate::from_ymd_opt(MON.0, MON.1, MON.2).unwrap(), now);
        assert_eq!(status_of(&conn, id, "2026-09-14").unwrap(), "failed");
    }

    #[test]
    fn day_rollover_creates_fresh_instances() {
        let conn = mem_db();
        let id = add_task(&conn, 8 * 60, 8 * 60 + 30, 0b1111111);

        // Monday 8:15 — done
        let mon = at(MON.0, MON.1, MON.2, 8, 15);
        sync_day_at(&conn, NaiveDate::from_ymd_opt(MON.0, MON.1, MON.2).unwrap(), mon);
        conn.execute(
            "UPDATE task_instances SET status='done' WHERE task_id=?1",
            params![id],
        ).unwrap();

        // Tuesday 7:00 — fresh pending instance, Monday untouched
        let tue = at(2026, 9, 15, 7, 0);
        sync_day_at(&conn, NaiveDate::from_ymd_opt(2026, 9, 15).unwrap(), tue);
        assert_eq!(status_of(&conn, id, "2026-09-15").unwrap(), "pending");
        assert_eq!(status_of(&conn, id, "2026-09-14").unwrap(), "done");
    }

    #[test]
    fn weekday_mask_skips_unscheduled_days() {
        let conn = mem_db();
        let id = add_task(&conn, 8 * 60, 8 * 60 + 30, 1 << 0); // Monday only

        // Tuesday: nothing scheduled
        let tue = at(2026, 9, 15, 9, 0);
        sync_day_at(&conn, NaiveDate::from_ymd_opt(2026, 9, 15).unwrap(), tue);
        assert!(status_of(&conn, id, "2026-09-15").is_none());

        // Monday: exists
        let mon = at(MON.0, MON.1, MON.2, 9, 0);
        sync_day_at(&conn, NaiveDate::from_ymd_opt(MON.0, MON.1, MON.2).unwrap(), mon);
        assert!(status_of(&conn, id, "2026-09-14").is_some());
    }

    #[test]
    fn day_boundary_shifts_early_morning_to_yesterday() {
        let conn = mem_db();
        // boundary 4 AM: Tuesday 02:00 belongs to Monday
        let conn = mem_db();
        let id = add_task(&conn, 8 * 60, 8 * 60 + 30, 0b1111111);
        let now = at(2026, 9, 15, 2, 0);
        let today = routine_date(now, 4);
        assert_eq!(date_str(today), "2026-09-14");
        sync_day_at(&conn, today, now);
        // Monday's task (window long closed) is failed
        assert_eq!(status_of(&conn, id, "2026-09-14").unwrap(), "failed");
        // No Tuesday instance yet
        assert!(status_of(&conn, id, "2026-09-15").is_none());
    }

    #[test]
    fn past_day_seeds_as_failed() {
        let conn = mem_db();
        let id = add_task(&conn, 8 * 60, 8 * 60 + 30, 0b1111111);
        let now = at(2026, 9, 16, 10, 0); // Wednesday viewing Monday
        sync_day_at(&conn, NaiveDate::from_ymd_opt(MON.0, MON.1, MON.2).unwrap(), now);
        assert_eq!(status_of(&conn, id, "2026-09-14").unwrap(), "failed");
    }

    #[test]
    fn days_before_task_creation_stay_unseeded() {
        let conn = mem_db();
        // created_at is 2026-09-14 (see add_task)
        let id = add_task(&conn, 8 * 60, 8 * 60 + 30, 0b1111111);
        let now = at(2026, 9, 16, 10, 0);
        // Viewing Friday 2026-09-11 — before the task existed
        sync_day_at(&conn, NaiveDate::from_ymd_opt(2026, 9, 11).unwrap(), now);
        assert!(status_of(&conn, id, "2026-09-11").is_none());
        // Viewing Monday 2026-09-14 — on/after creation → seeded failed
        sync_day_at(&conn, NaiveDate::from_ymd_opt(MON.0, MON.1, MON.2).unwrap(), now);
        assert_eq!(status_of(&conn, id, "2026-09-14").unwrap(), "failed");
    }

    #[test]
    fn streak_counts_perfect_days_and_zero_task_days_dont_break() {
        let conn = mem_db();
        add_task(&conn, 8 * 60, 8 * 60 + 30, 0b1111111);

        // Fri + Sat + Sun perfect, Mon pending (in progress)
        for d in ["2026-09-11", "2026-09-12", "2026-09-13"] {
            conn.execute(
                "INSERT INTO task_instances (task_id, date, status) VALUES (1, ?1, 'done')",
                params![d],
            )
            .unwrap();
        }
        let now = at(MON.0, MON.1, MON.2, 8, 15); // inside the window → pending
        sync_day_at(&conn, NaiveDate::from_ymd_opt(MON.0, MON.1, MON.2).unwrap(), now);
        let stats = day_counts(&conn, "2026-09-14");
        assert_eq!(stats.pending, 1);

        // Streak: Friday→Sunday perfect = 3 (today pending doesn't count or break)
        let mut streak = 0;
        let today = NaiveDate::from_ymd_opt(MON.0, MON.1, MON.2).unwrap();
        for i in 0..7 {
            let d = today - Duration::days(i);
            let ds = date_str(d);
            let s = day_counts(&conn, &ds);
            if s.total == 0 { continue; }
            if s.failed > 0 { break; }
            if s.done == s.total { streak += 1; } else if i == 0 { continue; } else { break; }
        }
        assert_eq!(streak, 3);
    }

    #[test]
    fn time_zone_resolution_and_validation() {
        let mut s = Settings::default();
        s.time_zone = "UTC".into();
        let n = active_now(&s).unwrap();
        let drift = (n - Utc::now().naive_utc()).num_minutes().abs();
        assert!(drift <= 1, "UTC zone should match UTC clock, drift {drift}m");

        s.time_zone = "Mars/Olympus".into();
        assert!(active_now(&s).is_err());
        assert!(validate_zone("Mars/Olympus").is_err());
        assert_eq!(validate_zone("device").unwrap(), "device");
        assert_eq!(validate_zone("Asia/Kolkata").unwrap(), "Asia/Kolkata");
    }

    #[test]
    fn validate_rejects_bad_windows() {
        let ok = TaskInput {
            kind: "daily".into(),
            name: "x".into(),
            icon: "💧".into(),
            color: "#34d399".into(),
            start_minute: 480,
            end_minute: 510,
            days_mask: 127,
        };
        assert!(validate_input(&ok).is_ok());

        let inverted = TaskInput { end_minute: 480, start_minute: 510, ..ok };
        assert!(validate_input(&inverted).is_err());

        let no_days = TaskInput { days_mask: 0, ..inverted };
        assert!(validate_input(&no_days).is_err());
    }
}
