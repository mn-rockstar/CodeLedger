import type { LeetCodeSubmissionDetails, Stats } from "../types";
import {
  mergeStats,
  parseStats,
  serializeStats,
  STATS_FILENAME,
} from "../stats";

const GITHUB_API = "https://api.github.com";

/** Thrown by putFile when `retryOn409` is disabled and GitHub reports a conflict. */
export class GitHubConflictError extends Error {}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
}

// btoa()/atob() only handle Latin1, so route through encodeURIComponent to
// safely handle text that may contain non-ASCII characters.
function encodeBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

function decodeBase64(b64: string): string {
  // GitHub wraps its base64 payloads at 60 chars; atob rejects the newlines.
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ""))));
}

export async function getFile(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<{ sha: string; text: string } | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    { headers: authHeaders(token) }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub get file failed (${path}): ${res.status}`);
  }
  const body = (await res.json()) as { sha: string; content?: string };
  return { sha: body.sha, text: body.content ? decodeBase64(body.content) : "" };
}

export async function putFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string,
  options: { retryOn409?: boolean } = {}
): Promise<{ sha: string }> {
  const { retryOn409 = true } = options;

  const doPut = (currentSha?: string) =>
    fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: encodeBase64(content),
        ...(currentSha ? { sha: currentSha } : {}),
      }),
    });

  let res = await doPut(sha);

  if (res.status === 409) {
    // Our sha was stale — something changed the file since we last read it.
    // For solution files, whatever we're writing is authoritative, so
    // re-read the sha and overwrite. Callers whose content depends on what's
    // already there (stats.json) pass retryOn409:false so they can re-merge
    // instead of clobbering.
    if (!retryOn409) {
      throw new GitHubConflictError(`Conflict writing ${path}`);
    }
    const current = await getFile(token, owner, repo, path);
    res = await doPut(current?.sha);
  }

  if (!res.ok) {
    throw new Error(`GitHub put file failed (${path}): ${res.status}`);
  }
  const body = (await res.json()) as { content: { sha: string } };
  return { sha: body.content.sha };
}

// Keyed by whatever string LeetCode's `lang.name` field returns for the
// submission's language, lowercased. Cross-checked against the reference
// extension's language table (ref/scripts/leetcode/util.js) for coverage.
const LANGUAGE_TO_EXTENSION: Record<string, string> = {
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  dart: "dart",
  elixir: "ex",
  erlang: "erl",
  golang: "go",
  java: "java",
  javascript: "js",
  kotlin: "kt",
  mysql: "sql",
  mssql: "sql",
  oraclesql: "sql",
  pandas: "py",
  php: "php",
  python: "py",
  python3: "py",
  racket: "rkt",
  ruby: "rb",
  rust: "rs",
  scala: "scala",
  swift: "swift",
  typescript: "ts",
};

function extensionFor(lang: string): string {
  return LANGUAGE_TO_EXTENSION[lang.toLowerCase()] ?? "txt";
}

function formatPercentile(p: number | null): string {
  return p === null ? "N/A" : `${p.toFixed(1)}%`;
}

export interface ProblemFiles {
  folder: string;
  readmePath: string;
  readmeContent: string;
  solutionPath: string;
  solutionContent: string;
  commitMessage: string;
}

export function buildProblemFiles(
  details: LeetCodeSubmissionDetails
): ProblemFiles {
  const { question } = details;
  const paddedId = question.questionId.padStart(4, "0");
  const folder = `${paddedId}-${question.titleSlug}`;
  const topics = question.topicTags.map((t) => t.name).join(", ");
  const ext = extensionFor(details.lang);

  const readmeContent = [
    `# ${question.questionId}. ${question.title}`,
    "",
    `**Difficulty:** ${question.difficulty}`,
    `**Topics:** ${topics || "—"}`,
    `**Link:** https://leetcode.com/problems/${question.titleSlug}/`,
    "",
    "---",
    "",
    question.content,
    "",
  ].join("\n");

  const commitMessage = `Time: ${details.runtimeDisplay} (${formatPercentile(
    details.runtimePercentile
  )}), Memory: ${details.memoryDisplay} (${formatPercentile(
    details.memoryPercentile
  )})`;

  return {
    folder,
    readmePath: `${folder}/README.md`,
    readmeContent,
    solutionPath: `${folder}/${question.titleSlug}.${ext}`,
    solutionContent: details.code,
    commitMessage,
  };
}

function splitOwnerRepo(ownerRepo: string): [string, string] {
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`linked_repo is not in "owner/repo" form: ${ownerRepo}`);
  }
  return [owner, repo];
}

/**
 * Writes stats.json to the repo root, merging with whatever's already there
 * so a second device (or a stale local copy) can't wipe or double-count
 * anything. Returns the merged stats, which the caller should store locally
 * so the two stay in step.
 *
 * On a conflict we re-read and re-merge rather than overwriting, because
 * unlike a solution file, this file's correct contents depend on what the
 * remote already holds.
 */
export async function commitStats(
  token: string,
  ownerRepo: string,
  localStats: Stats,
  maxAttempts = 3
): Promise<Stats> {
  const [owner, repo] = splitOwnerRepo(ownerRepo);

  for (let attempt = 1; ; attempt++) {
    const existing = await getFile(token, owner, repo, STATS_FILENAME);
    const merged = existing
      ? mergeStats(parseStats(existing.text), localStats)
      : localStats;

    try {
      await putFile(
        token,
        owner,
        repo,
        STATS_FILENAME,
        serializeStats(merged),
        `Update stats: ${merged.solved} solved (${merged.easy} easy / ${merged.medium} medium / ${merged.hard} hard)`,
        existing?.sha,
        { retryOn409: false }
      );
      return merged;
    } catch (err) {
      if (err instanceof GitHubConflictError && attempt < maxAttempts) {
        continue;
      }
      throw err;
    }
  }
}

/**
 * Reads stats.json without writing anything — lets a freshly-connected
 * device show the real counts straight away instead of zero until its first
 * solve. Returns null when the repo has no stats.json yet.
 */
export async function fetchRemoteStats(
  token: string,
  ownerRepo: string
): Promise<Stats | null> {
  const [owner, repo] = splitOwnerRepo(ownerRepo);
  const existing = await getFile(token, owner, repo, STATS_FILENAME);
  return existing ? parseStats(existing.text) : null;
}

/**
 * Force-writes stats.json, ignoring whatever the remote holds. Only for an
 * explicit user-initiated reset — every other write path must go through
 * commitStats so it merges instead of clobbering.
 */
export async function overwriteStats(
  token: string,
  ownerRepo: string,
  stats: Stats
): Promise<void> {
  const [owner, repo] = splitOwnerRepo(ownerRepo);
  const existing = await getFile(token, owner, repo, STATS_FILENAME);
  await putFile(
    token,
    owner,
    repo,
    STATS_FILENAME,
    serializeStats(stats),
    "Reset stats",
    existing?.sha
  );
}

export async function commitProblemFiles(
  token: string,
  ownerRepo: string,
  files: ProblemFiles
): Promise<void> {
  const [owner, repo] = splitOwnerRepo(ownerRepo);

  const existingReadme = await getFile(token, owner, repo, files.readmePath);
  await putFile(
    token,
    owner,
    repo,
    files.readmePath,
    files.readmeContent,
    files.commitMessage,
    existingReadme?.sha
  );

  const existingSolution = await getFile(
    token,
    owner,
    repo,
    files.solutionPath
  );
  await putFile(
    token,
    owner,
    repo,
    files.solutionPath,
    files.solutionContent,
    files.commitMessage,
    existingSolution?.sha
  );
}
