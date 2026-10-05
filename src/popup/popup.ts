import { getStored, removeStored, setStored } from "../storage";
import {
  createRepo,
  getAuthenticatedUser,
  getRepo,
  GitHubAuthError,
  GitHubForbiddenError,
  GitHubNameTakenError,
  GitHubNotFoundError,
  parseRepoInput,
} from "../github/client";
import { loginWithGitHub, OAuthCancelledError } from "../github/oauth";
import { fetchRemoteStats, overwriteStats } from "../github/contents";
import { deriveMetrics, emptyStats, mergeStats, relativeTime } from "../stats";
import { difficultySegments, renderDonut } from "./donut";
import type { Stats } from "../types";

const app = document.getElementById("app") as HTMLDivElement;

// --- Author details, shown in the About panel -----------------------------
//
// AUTHOR_LINKEDIN is the one value left to fill in. While it's an empty
// string the LinkedIn row simply isn't rendered, so a blank never ships as a
// dead link — paste the full https://www.linkedin.com/in/... URL here.
const AUTHOR_NAME = "Mohit Narvariya";
const AUTHOR_EMAIL = "mohitnarvariya70@gmail.com";
const AUTHOR_LINKEDIN = "";

/**
 * The extension's own source. Linked from About so anyone can read the code
 * and check the privacy claims for themselves rather than taking them on
 * trust — which is the whole argument for an extension holding a GitHub
 * token. Not to be confused with the user's linked solutions repo.
 */
const SOURCE_REPO_URL = "https://github.com/mn-rockstar/CodeLedger";

/** One refresh per popup session — enough to catch up another device's solves. */
let statsRefreshed = false;

/** Status chip in the title bar; empty string clears it. */
function setBadge(text: string): void {
  const badge = document.getElementById("badge");
  if (!badge) return;
  badge.innerHTML = text
    ? `<span class="dot"></span>${escapeHtml(text)}`
    : "";
}

/** These values come from GitHub/LeetCode APIs and land in innerHTML. */
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch]!
  );
}

// --- Views -------------------------------------------------------------

/**
 * Streak, weekly count, language and last-solved all read fields that only
 * started being recorded in v0.6 — so on a stats file written before that
 * they'd every one show a dash. Rather than four empty tiles, say why.
 */
function renderKpis(stats: Stats): string {
  const metrics = deriveMetrics(stats);

  if (!metrics.lastSolved && !metrics.topLanguage) {
    return `<div class="card"><p class="empty" style="padding:12px 0">
      Streak, language and activity stats begin from your next solve.
    </p></div>`;
  }

  const tiles: { value: string; label: string; small?: boolean }[] = [
    {
      value: metrics.streakDays > 0 ? String(metrics.streakDays) : "0",
      label: metrics.streakDays === 1 ? "day streak" : "day streak",
    },
    { value: String(metrics.solvedLast7Days), label: "last 7 days" },
    {
      value: metrics.topLanguage ?? "—",
      label: "top language",
      small: true,
    },
    {
      value: metrics.lastSolved?.title ?? "—",
      label: metrics.lastSolved
        ? relativeTime(metrics.lastSolved.solvedAt)
        : "last solved",
      small: true,
    },
  ];

  return `<div class="kpis">${tiles
    .map(
      (tile) => `
      <div class="kpi">
        <div class="kpi-value${tile.small ? " small" : ""}" title="${escapeHtml(tile.value)}">${escapeHtml(tile.value)}</div>
        <div class="kpi-label">${escapeHtml(tile.label)}</div>
      </div>`
    )
    .join("")}</div>`;
}

function renderConnect(errorMsg?: string): void {
  setBadge("");
  app.innerHTML = `
    <p class="muted">Connect your GitHub account to start auto-committing solutions.</p>
    ${errorMsg ? `<div class="error">${errorMsg}</div>` : ""}
    <button id="login-btn">Login with GitHub</button>
  `;
  document.getElementById("login-btn")!.addEventListener("click", onLoginClick);
}

function renderRepoSetup(username: string, errorMsg?: string): void {
  setBadge("setup");
  app.innerHTML = `
    <p class="muted">Connected as <strong>${username}</strong></p>
    ${errorMsg ? `<div class="error">${errorMsg}</div>` : ""}
    <label for="new-repo-name">Create a new private repo</label>
    <input id="new-repo-name" type="text" placeholder="my-solutions" />
    <button id="create-btn">Create repo</button>
    <p class="muted" style="margin-top:10px">— or —</p>
    <label for="link-repo">Link an existing repo</label>
    <input id="link-repo" type="text" placeholder="https://github.com/username/repository" />
    <p class="hint">Paste the repo's GitHub link, or just type its name.</p>
    <button id="link-btn">Link repo</button>
    <p class="muted" style="margin-top:10px"><a href="#" id="disconnect-link">Disconnect GitHub</a></p>
  `;
  document
    .getElementById("create-btn")!
    .addEventListener("click", () => onCreateClick(username));
  document
    .getElementById("link-btn")!
    .addEventListener("click", () => onLinkClick(username));
  document.getElementById("disconnect-link")!.addEventListener("click", (e) => {
    e.preventDefault();
    onDisconnectClick();
  });
}

async function renderConnected(
  username: string,
  repo: string,
  confirmingReset = false
): Promise<void> {
  const { leetcode_username_confirmed, leetcode_username_detected, stats } =
    await getStored([
      "leetcode_username_confirmed",
      "leetcode_username_detected",
      "stats",
    ]);

  setBadge("connected");

  const leetcodeAccount = leetcode_username_confirmed ?? leetcode_username_detected;
  const leetcodeCell = leetcodeAccount
    ? escapeHtml(leetcodeAccount)
    : `<span class="pending">not detected yet</span>`;

  const identity = `
    <div class="card identity">
      <dl>
        <dt>GitHub</dt><dd>${escapeHtml(username)}</dd>
        <dt>LeetCode</dt><dd>${leetcodeCell}</dd>
        <dt>Repo</dt>
        <dd><a href="https://github.com/${encodeURI(repo)}" target="_blank">${escapeHtml(repo)}</a></dd>
      </dl>
    </div>
  `;

  const stateNote =
    leetcodeAccount && !leetcode_username_confirmed
      ? `<p class="muted">That LeetCode account isn't confirmed yet — you'll be asked on your next solve.</p>`
      : "";

  const updateButton =
    leetcode_username_detected &&
    leetcode_username_detected !== leetcode_username_confirmed
      ? `<button id="update-account-btn">Use detected account (${escapeHtml(leetcode_username_detected)})</button>`
      : "";

  const solved = stats?.solved ?? 0;
  const dashboard =
    solved > 0
      ? `
    <div class="card">
      <div class="chart">
        ${renderDonut(stats!)}
        <div class="hero">
          <div class="hero-value">${solved}</div>
          <div class="hero-label">solved</div>
        </div>
      </div>
      <div class="legend">
        ${difficultySegments(stats!)
          .map(
            (segment) => `
          <div class="legend-row">
            <span class="swatch" style="background: var(${segment.cssVar})"></span>
            <span class="legend-name">${segment.label}</span>
            <span class="legend-value">${segment.count}</span>
            <span class="legend-pct">${Math.round((segment.count / solved) * 100)}%</span>
          </div>`
          )
          .join("")}
      </div>
    </div>
    ${renderKpis(stats!)}`
      : `<div class="card"><p class="empty">No solves recorded yet.<br />Solve a problem on LeetCode to get started.</p></div>`;

  const resetCard = confirmingReset
    ? `<div class="card">
         <p class="muted" style="margin-top:0">Reset stats to zero? This clears the counter
         here and <code>stats.json</code> in your repo. Your committed solutions are
         not touched.</p>
         <div class="row">
           <button id="reset-confirm-btn">Yes, reset</button>
           <button id="reset-cancel-btn">Cancel</button>
         </div>
       </div>`
    : "";

  app.innerHTML = `
    ${dashboard}
    ${identity}
    ${stateNote}
    ${updateButton}
    ${resetCard}
    <div class="actions">
      <div class="row">
        <a class="linkish" href="guide.html" target="_blank" rel="noopener">Help</a>
        <button class="linkish" id="about-btn">About</button>
        ${
          solved > 0 && !confirmingReset
            ? `<button class="linkish" id="reset-link">Reset stats</button>`
            : ""
        }
      </div>
      <button class="linkish" id="disconnect-btn">Disconnect</button>
    </div>
  `;
  document
    .getElementById("disconnect-btn")!
    .addEventListener("click", onDisconnectClick);
  document.getElementById("update-account-btn")?.addEventListener("click", async () => {
    if (!leetcode_username_detected) return;
    await setStored({ leetcode_username_confirmed: leetcode_username_detected });
    renderConnected(username, repo);
  });
  document
    .getElementById("about-btn")
    ?.addEventListener("click", () => renderAbout(username, repo));
  document.getElementById("reset-link")?.addEventListener("click", () => {
    renderConnected(username, repo, true);
  });
  document.getElementById("reset-cancel-btn")?.addEventListener("click", () => {
    renderConnected(username, repo);
  });
  document
    .getElementById("reset-confirm-btn")
    ?.addEventListener("click", () => onResetStatsClick(username, repo));

  // Render from local storage first so the popup is instant, then reconcile
  // with the repo in the background — that's what lets a freshly-connected
  // device show its real counts without waiting for a solve. Skipped mid
  // reset-confirmation so a re-render can't dismiss the prompt.
  if (!confirmingReset) void refreshStatsFromRepo(username, repo);
}

/**
 * Swaps the dashboard for a small credits panel, the same way the reset
 * confirmation does — no second window, and Back returns to exactly where
 * the user was.
 */
function renderAbout(username: string, repo: string): void {
  setBadge("about");

  const version = chrome.runtime.getManifest().version;
  const links = [
    AUTHOR_LINKEDIN
      ? `<dt>LinkedIn</dt><dd><a href="${escapeHtml(AUTHOR_LINKEDIN)}" target="_blank" rel="noopener">View profile</a></dd>`
      : "",
    `<dt>Email</dt><dd><a href="mailto:${escapeHtml(AUTHOR_EMAIL)}">${escapeHtml(AUTHOR_EMAIL)}</a></dd>`,
    `<dt>Source</dt><dd><a href="${escapeHtml(SOURCE_REPO_URL)}" target="_blank" rel="noopener">View on GitHub</a></dd>`,
  ].join("");

  app.innerHTML = `
    <div class="card identity">
      <p class="muted" style="margin-top:0">
        <strong>CodeLedger</strong> commits your accepted LeetCode solutions to
        a GitHub repo you own.
      </p>
      <dl>
        <dt>Built by</dt><dd>${escapeHtml(AUTHOR_NAME)}</dd>
        ${links}
        <dt>Version</dt><dd>${escapeHtml(version)}</dd>
      </dl>
    </div>
    <div class="actions">
      <button class="linkish" id="about-back-btn">← Back</button>
      <span></span>
    </div>
  `;

  document
    .getElementById("about-back-btn")!
    .addEventListener("click", () => renderConnected(username, repo));
}

async function refreshStatsFromRepo(
  username: string,
  repo: string
): Promise<void> {
  if (statsRefreshed) return;
  statsRefreshed = true;

  const { gh_token, stats } = await getStored(["gh_token", "stats"]);
  if (!gh_token) return;

  try {
    const remote = await fetchRemoteStats(gh_token, repo);
    if (!remote) return;

    const local = stats ?? emptyStats();
    const merged = mergeStats(remote, local);
    if (merged.solved === local.solved) return;

    await setStored({ stats: merged });
    renderConnected(username, repo);
  } catch (err) {
    // Purely additive — the popup already rendered with local counts.
    console.warn("[CodeLedger] couldn't refresh stats from the repo:", err);
  }
}

// --- Actions -------------------------------------------------------------

async function onLoginClick(): Promise<void> {
  try {
    const { token } = await loginWithGitHub();
    const { login } = await getAuthenticatedUser(token);

    const { gh_username: previousUsername } = await getStored(["gh_username"]);
    if (previousUsername && previousUsername !== login) {
      // A different GitHub account just logged in. The old repo link belongs
      // to the previous account and this token likely can't write to it, and
      // the old stats describe that other account's repo — carrying them
      // forward would merge counts into the new repo for problems that were
      // never solved into it.
      await removeStored(["linked_repo", "sync_ready", "stats"]);
    }

    await setStored({ gh_token: token, gh_username: login });
    const { linked_repo, sync_ready } = await getStored(["linked_repo", "sync_ready"]);
    if (linked_repo && sync_ready) {
      renderConnected(login, linked_repo);
    } else {
      renderRepoSetup(login);
    }
  } catch (err) {
    if (err instanceof OAuthCancelledError) {
      renderConnect();
    } else {
      renderConnect("Couldn't log you in with GitHub. Try again.");
    }
  }
}

async function onCreateClick(username: string): Promise<void> {
  const input = document.getElementById("new-repo-name") as HTMLInputElement;
  const name = input.value.trim();
  if (!name) return;
  const { gh_token } = await getStored(["gh_token"]);
  if (!gh_token) return renderConnect();
  try {
    const { fullName } = await createRepo(
      gh_token,
      name,
      "LeetCode solutions, auto-committed by CodeLedger"
    );
    await setStored({ linked_repo: fullName, sync_ready: true });
    renderConnected(username, fullName);
  } catch (err) {
    if (err instanceof GitHubNameTakenError) {
      renderRepoSetup(username, `${err.message} — try linking it instead`);
    } else {
      renderRepoSetup(username, "Couldn't create that repo. Try again.");
    }
  }
}

async function onLinkClick(username: string): Promise<void> {
  const input = document.getElementById("link-repo") as HTMLInputElement;
  // A bare name is read as one of the signed-in account's own repos, which
  // is what people mean when they type just the repository's name.
  const parsed = parseRepoInput(input.value, username);
  if (!parsed) {
    return renderRepoSetup(
      username,
      "That doesn't look like a GitHub repo — paste its URL, or type the repo name."
    );
  }

  const { gh_token } = await getStored(["gh_token"]);
  if (!gh_token) return renderConnect();
  try {
    const { fullName } = await getRepo(gh_token, parsed.owner, parsed.repo);
    await setStored({ linked_repo: fullName, sync_ready: true });
    renderConnected(username, fullName);
  } catch (err) {
    // Echo back what was actually looked up — with a bare name the owner was
    // inferred, so showing it is how the user spots a wrong guess.
    const target = `${parsed.owner}/${parsed.repo}`;
    if (err instanceof GitHubNotFoundError) {
      renderRepoSetup(
        username,
        `Couldn't find ${escapeHtml(target)}. Check the name, or that this account can see it.`
      );
    } else if (err instanceof GitHubForbiddenError) {
      renderRepoSetup(
        username,
        `No write access to ${escapeHtml(target)}.`
      );
    } else {
      renderRepoSetup(username, "Couldn't link that repo. Try again.");
    }
  }
}

async function onResetStatsClick(
  username: string,
  repo: string
): Promise<void> {
  const fresh = emptyStats();
  await setStored({ stats: fresh });

  const { gh_token } = await getStored(["gh_token"]);
  if (gh_token) {
    try {
      await overwriteStats(gh_token, repo, fresh);
    } catch (err) {
      // Local stats are already cleared; the repo copy will be corrected on
      // the next solve, so this isn't worth blocking the reset over.
      console.warn("[CodeLedger] couldn't reset stats.json in the repo:", err);
    }
  }
  renderConnected(username, repo);
}

async function onDisconnectClick(): Promise<void> {
  await chrome.storage.local.clear();
  renderConnect();
}

// --- Boot -------------------------------------------------------------

async function init(): Promise<void> {
  const { gh_token, gh_username, linked_repo } = await getStored([
    "gh_token",
    "gh_username",
    "linked_repo",
  ]);

  if (!gh_token) {
    renderConnect();
    return;
  }

  try {
    const { login } = await getAuthenticatedUser(gh_token);
    if (login !== gh_username) {
      await setStored({ gh_username: login });
    }
    if (linked_repo) {
      renderConnected(login, linked_repo);
    } else {
      renderRepoSetup(login);
    }
  } catch (err) {
    if (err instanceof GitHubAuthError) {
      await chrome.storage.local.clear();
      renderConnect("Your saved token stopped working — reconnect");
    } else {
      renderConnect("Couldn't reach GitHub to verify your token");
    }
  }
}

init();
