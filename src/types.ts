export interface StoredData {
  gh_token?: string;
  gh_username?: string;
  linked_repo?: string;
  sync_ready?: boolean;
  leetcode_username_confirmed?: string;
  leetcode_username_detected?: string;
  stats?: Stats;
}

export type Difficulty = "Easy" | "Medium" | "Hard";

/**
 * Every field but `difficulty` is optional: records written before these
 * were captured still exist in users' stats.json, and the derived metrics
 * simply skip records that can't answer them rather than treating an older
 * file as corrupt.
 */
export interface ProblemRecord {
  difficulty: Difficulty;
  /** ISO timestamp of the most recent accepted solve. */
  solvedAt?: string;
  /** LeetCode's own language name, e.g. "python3". */
  lang?: string;
  /** Human-readable problem title, e.g. "Two Sum". */
  title?: string;
}

/**
 * `problems` is the source of truth — one entry per solved problem, keyed by
 * its repo folder name. The four counts are always *derived* from it, never
 * incremented in place, which is what makes merging two devices' stats
 * safe: the union of the maps can only ever count a problem once.
 */
export interface Stats {
  problems: Record<string, ProblemRecord>;
  solved: number;
  easy: number;
  medium: number;
  hard: number;
}

export interface TopicTag {
  name: string;
}

export interface LeetCodeQuestion {
  questionId: string;
  title: string;
  titleSlug: string;
  content: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topicTags: TopicTag[];
}

export interface LeetCodeSubmissionDetails {
  statusDisplay: string;
  runtime: string;
  runtimeDisplay: string;
  runtimePercentile: number | null;
  memory: string;
  memoryDisplay: string;
  memoryPercentile: number | null;
  code: string;
  lang: string;
  question: LeetCodeQuestion;
}
