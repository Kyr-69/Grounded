/**
 * Progression engine: XP, Ranks, and Consistency stages.
 *
 * Two separate systems:
 *  - Rank (total XP): Bronze → Silver → ... → Elite — "How much have I accomplished?"
 *  - Consistency (sustained 90%+ days): Spark → ... → Unstoppable — "How long have I stayed disciplined?"
 *
 * XP loop: do routines (+50/task) → complete the day (up to +800) →
 * the consistency stage multiplies the total afterward.
 */

// ---------------------------------------------------------------------------
// Ranks — based on total XP
// ---------------------------------------------------------------------------

export interface Rank {
  id: number;
  name: string;
  minXp: number;
  /** Color accent for UI. */
  color: string;
}

const RANK_DEFS: { name: string; minXp: number }[] = [
  { name: "Bronze I", minXp: 0 },
  { name: "Bronze II", minXp: 2_000 },
  { name: "Bronze III", minXp: 4_000 },
  { name: "Silver I", minXp: 7_000 },
  { name: "Silver II", minXp: 10_000 },
  { name: "Silver III", minXp: 14_000 },
  { name: "Gold I", minXp: 19_000 },
  { name: "Gold II", minXp: 25_000 },
  { name: "Gold III", minXp: 32_000 },
  { name: "Platinum I", minXp: 40_000 },
  { name: "Platinum II", minXp: 49_000 },
  { name: "Platinum III", minXp: 59_000 },
  { name: "Diamond I", minXp: 70_000 },
  { name: "Diamond II", minXp: 82_000 },
  { name: "Diamond III", minXp: 95_000 },
  { name: "Elite I", minXp: 110_000 },
  { name: "Elite II", minXp: 130_000 },
  { name: "Elite III", minXp: 150_000 },
];

const RANK_COLORS = [
  "#b08d57", // bronze
  "#a9b4c2", // silver
  "#f2c14e", // gold
  "#7dd3fc", // platinum
  "#a5b4fc", // diamond
  "#f472b6", // elite
];

export const RANKS: Rank[] = RANK_DEFS.map((r, i) => ({
  id: i + 1,
  name: r.name,
  minXp: r.minXp,
  color: RANK_COLORS[Math.floor(i / 3)],
}));

// ---------------------------------------------------------------------------
// Consistency — sustained 90%+ days, NOT a literal perfect streak
// ---------------------------------------------------------------------------

export interface ConsistencyStage {
  stage: number;
  title: string;
  /** Consecutive qualifying days required. */
  days: number;
  multiplier: number;
}

export const CONSISTENCY_STAGES: ConsistencyStage[] = [
  { stage: 1, title: "Spark", days: 3, multiplier: 1.0 },
  { stage: 2, title: "Momentum", days: 7, multiplier: 1.05 },
  { stage: 3, title: "Rhythm", days: 14, multiplier: 1.1 },
  { stage: 4, title: "Locked In", days: 30, multiplier: 1.2 },
  { stage: 5, title: "Deep Focus", days: 60, multiplier: 1.35 },
  { stage: 6, title: "Iron Will", days: 100, multiplier: 1.5 },
  { stage: 7, title: "Relentless", days: 150, multiplier: 1.75 },
  { stage: 8, title: "Apex", days: 210, multiplier: 2.0 },
  { stage: 9, title: "Mastery", days: 300, multiplier: 2.5 },
  { stage: 10, title: "Unstoppable", days: 365, multiplier: 3.0 },
];

/** Qualifying day = ≥90% completion with at least one task. */
const QUALIFY_PCT = 90;

export function qualifies(pct: number, total: number): boolean {
  return total > 0 && pct >= QUALIFY_PCT;
}

export interface ConsistencyState {
  /** Consecutive qualifying days (today excluded until it qualifies). */
  run: number;
  /** Best run ever. */
  best: number;
  stage: ConsistencyStage | null;
  next: ConsistencyStage | null;
  multiplier: number;
}

function pctOf(h: { total: number; done: number }): number {
  return h.total === 0 ? 0 : Math.round((h.done / h.total) * 100);
}

/**
 * Consistency run = consecutive qualifying days ending yesterday
 * (today doesn't count until it qualifies, so an in-progress day
 * never breaks the run).
 */
export function computeConsistency(
  history: { date: string; total: number; done: number; completion_pct?: number }[]
): ConsistencyState {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let current = 0;
  let best = 0;
  for (const h of sorted) {
    if (h.total === 0) continue; // zero-task days are rest days — never break the run
    if (qualifies(h.completion_pct ?? pctOf(h), h.total)) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return {
    run: current,
    best,
    stage: stageFor(current),
    next: nextStage(current),
    multiplier: multiplierFor(current),
  };
}

export function stageFor(run: number): ConsistencyStage | null {
  let active: ConsistencyStage | null = null;
  for (const s of CONSISTENCY_STAGES) {
    if (run >= s.days) active = s;
    else break;
  }
  return active;
}

export function nextStage(run: number): ConsistencyStage | null {
  return CONSISTENCY_STAGES.find((s) => run < s.days) ?? null;
}

export function multiplierFor(run: number): number {
  return stageFor(run)?.multiplier ?? 1.0;
}

// ---------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------

export const XP_PER_TASK = 50;
export const XP_PERFECT_DAY = 800;

/**
 * Base XP for a day, before the consistency multiplier:
 * +50 per completed task, +800 day bonus at 100%.
 */
export function baseXpForDay(done: number, total: number): number {
  if (total === 0) return 0;
  return done * XP_PER_TASK + (done === total ? XP_PERFECT_DAY : 0);
}

/**
 * The day's XP with the multiplier applied — but only when the day
 * qualifies (≥90%). Partial days earn base XP only.
 */
export function dayXp(done: number, total: number, multiplier: number): number {
  const base = baseXpForDay(done, total);
  const mult = qualifies(pctOf({ total, done }), total) ? multiplier : 1;
  return Math.round(base * mult);
}

export interface RankProgress {
  rank: Rank;
  next: Rank | null;
  into: number;
  span: number;
  pct: number;
}

export function rankFor(xp: number): RankProgress {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].minXp) idx = i;
    else break;
  }
  const rank = RANKS[idx];
  const next = RANKS[idx + 1] ?? null;
  const into = xp - rank.minXp;
  const span = next ? next.minXp - rank.minXp : 1;
  return { rank, next, into, span, pct: Math.min(100, Math.round((into / span) * 100)) };
}

/** Total XP across a history window + live total override. */
export function totalXp(history: { total: number; done: number }[], multiplier: number): number {
  return history.reduce((acc, h) => acc + dayXp(h.done, h.total, multiplier), 0);
}
