const GITHUB_API = "https://api.github.com";

export interface ParsedRepo {
  owner: string;
  repo: string;
}

// GitHub allows letters, digits, hyphen, underscore and dot in repo names;
// account names are letters, digits and hyphens (not leading/trailing).
const REPO_NAME = /^[A-Za-z0-9_.-]+$/;
const OWNER_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

/**
 * Accepts whatever someone is likely to paste for "which repo?" — the
 * browser URL, a clone URL, `owner/repo`, or just the bare repo name (in
 * which case the signed-in account is assumed to be the owner).
 *
 * Returns null when the input can't be read as a GitHub repo, including
 * URLs for other hosts: those leave a dotted hostname in the owner slot,
 * which OWNER_NAME rejects.
 */
export function parseRepoInput(
  raw: string,
  defaultOwner: string
): ParsedRepo | null {
  let text = raw.trim();
  if (!text) return null;

  // git@github.com:owner/repo.git
  const ssh = /^git@github\.com:(.+)$/i.exec(text);
  if (ssh) text = ssh[1]!;

  text = text
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?github\.com\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\.git$/i, "");

  // Anything after owner/repo — /tree/main, /issues — is just discarded.
  const parts = text.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const owner = parts.length === 1 ? defaultOwner : parts[0]!;
  const repo = (parts.length === 1 ? parts[0]! : parts[1]!).replace(
    /\.git$/i,
    ""
  );

  if (!OWNER_NAME.test(owner) || !REPO_NAME.test(repo)) return null;
  return { owner, repo };
}

export class GitHubAuthError extends Error {}
export class GitHubNotFoundError extends Error {}
export class GitHubForbiddenError extends Error {}
export class GitHubNameTakenError extends Error {}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
}

export async function getAuthenticatedUser(
  token: string
): Promise<{ login: string }> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: authHeaders(token),
  });
  if (res.status === 401) {
    throw new GitHubAuthError("That token isn't valid");
  }
  if (!res.ok) {
    throw new Error(`GitHub /user failed: ${res.status}`);
  }
  const body = (await res.json()) as { login: string };
  return { login: body.login };
}

export async function createRepo(
  token: string,
  name: string,
  description: string
): Promise<{ fullName: string }> {
  const res = await fetch(`${GITHUB_API}/user/repos`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      private: true,
      auto_init: true,
      description,
    }),
  });
  if (res.status === 422) {
    throw new GitHubNameTakenError(
      `A repo named "${name}" already exists on your account`
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub create repo failed: ${res.status}`);
  }
  const body = (await res.json()) as { full_name: string };
  return { fullName: body.full_name };
}

export async function getRepo(
  token: string,
  owner: string,
  repo: string
): Promise<{ fullName: string }> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: authHeaders(token),
  });
  if (res.status === 404) {
    throw new GitHubNotFoundError(`Repo ${owner}/${repo} not found`);
  }
  if (res.status === 403) {
    throw new GitHubForbiddenError(
      `Token doesn't have write access to ${owner}/${repo}`
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub get repo failed: ${res.status}`);
  }
  const body = (await res.json()) as { full_name: string };
  return { fullName: body.full_name };
}
