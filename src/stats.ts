import type { ProblemRecord, Stats } from "./types";

export const STATS_FILENAME = "stats.json";

export function emptyStats(): Stats {
  return { problems: {}, solved: 0, easy: 0, medium: 0, hard: 0 };
}

/**
 * Counts are always recomputed from the `problems` map rather than
 * incremented, so re-solving a problem or merging two devices' stats can
 * never double-count.
 */
function withRecomputedCounts(problems: Stats["problems"]): Stats {
  let easy = 0;
  let medium = 0;
  let hard = 0;
  for (const record of Object.values(problems)) {
    if (record.difficulty === "Easy") easy++;
    else if (record.difficulty === "Medium") medium++;
    else if (record.difficulty === "Hard") hard++;
  }
  return {
    problems,
    solved: Object.keys(problems).length,
    easy,
    medium,
    hard,
  };
}

/**
 * Re-solving a problem overwrites its record rather than adding one, so the
 * counts hold steady while `solvedAt` moves forward — which is what keeps a
 * streak alive when you revisit an old problem.
 */
export function recordSolve(
  stats: Stats,
  problemFolder: string,
  record: ProblemRecord
): Stats {
  return withRecomputedCounts({
    ...stats.problems,
    [problemFolder]: record,
  });
}

/** Union of both sides' per-problem records, with counts recomputed. */
export function mergeStats(a: Stats, b: Stats): Stats {
  return withRecomputedCounts({ ...a.problems, ...b.problems });
}

/**
 * Tolerates anything that isn't a well-formed Stats object (an older
 * format, hand-edited JSON, a truncated file) by falling back to empty
 * rather than throwing — a corrupt remote file shouldn't be able to break
 * a solve.
 */
export function parseStats(text: string): Stats {
  try {
    const parsed = JSON.parse(text) as Partial<Stats> | null;
    if (!parsed || typeof parsed !== "object" || !parsed.problems) {
      return emptyStats();
    }
    // Drop entries that aren't shaped like records, so one hand-edited line
    // can't take down counting for the whole file.
    const problems: Stats["problems"] = {};
    for (const [folder, record] of Object.entries(parsed.problems)) {
      if (record && typeof record === "object" && "difficulty" in record) {
        problems[folder] = record as ProblemRecord;
      }
    }
    return withRecomputedCounts(problems);
  } catch {
    return emptyStats();
  }
}

export function serializeStats(stats: Stats): string {
  return `${JSON.stringify(stats, null, 2)}\n`;
}

// --- Derived metrics -------------------------------------------------------
//
// All of these read optional fields, so they degrade quietly on records
// written before those fields were captured: a problem with no `solvedAt`
// simply doesn't contribute to the streak rather than breaking it.

export interface DerivedMetrics {
  streakDays: number;
  solvedLast7Days: number;
  topLanguage: string | null;
  lastSolved: { title: string; solvedAt: string } | null;
}

const LANGUAGE_DISPLAY: Record<string, string> = {
  c: "C",
  cpp: "C++",
  csharp: "C#",
  dart: "Dart",
  elixir: "Elixir",
  erlang: "Erlang",
  golang: "Go",
  java: "Java",
  javascript: "JavaScript",
  kotlin: "Kotlin",
  mssql: "MS SQL",
  mysql: "MySQL",
  oraclesql: "Oracle SQL",
  pandas: "Pandas",
  php: "PHP",
  python: "Python",
  python3: "Python",
  racket: "Racket",
  ruby: "Ruby",
  rust: "Rust",
  scala: "Scala",
  swift: "Swift",
  typescript: "TypeScript",
};

/** Local calendar day, deliberately not UTC — "today" means the user's today. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function deriveMetrics(stats: Stats, now = new Date()): DerivedMetrics {
  const solveDays = new Set<string>();
  const languageCounts = new Map<string, number>();
  let latest: { title: string; solvedAt: string; at: number } | null = null;
  let solvedLast7Days = 0;

  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  for (const [folder, record] of Object.entries(stats.problems)) {
    const solvedAt = parseDate(record.solvedAt);
    if (solvedAt) {
      solveDays.add(dayKey(solvedAt));
      if (solvedAt.getTime() >= weekAgo) solvedLast7Days++;
      if (!latest || solvedAt.getTime() > latest.at) {
        latest = {
          title: record.title ?? folder,
          solvedAt: record.solvedAt!,
          at: solvedAt.getTime(),
        };
      }
    }
    if (record.lang) {
      const key = record.lang.toLowerCase();
      languageCounts.set(key, (languageCounts.get(key) ?? 0) + 1);
    }
  }

  let topLanguage: string | null = null;
  let topCount = 0;
  for (const [lang, count] of languageCounts) {
    if (count > topCount) {
      topCount = count;
      topLanguage = LANGUAGE_DISPLAY[lang] ?? lang;
    }
  }

  return {
    streakDays: currentStreak(solveDays, now),
    solvedLast7Days,
    topLanguage,
    lastSolved: latest ? { title: latest.title, solvedAt: latest.solvedAt } : null,
  };
}

function currentStreak(solveDays: Set<string>, now: Date): number {
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  // If nothing is logged for today yet, start counting from yesterday —
  // otherwise a live streak would read as broken every morning until the
  // day's first solve.
  if (!solveDays.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!solveDays.has(dayKey(cursor))) return 0;
  }

  let streak = 0;
  while (solveDays.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function relativeTime(iso: string, now = new Date()): string {
  const then = parseDate(iso);
  if (!then) return "";
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}
