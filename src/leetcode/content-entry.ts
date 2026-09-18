import {
  fetchSubmissionDetailsUntilGraded,
  getCurrentLeetCodeUsername,
  getMostRecentSubmissionId,
} from "./graphql";
import {
  buildProblemFiles,
  commitProblemFiles,
  commitStats,
} from "../github/contents";
import { emptyStats, recordSolve } from "../stats";
import { getStored, setStored } from "../storage";
import type { LeetCodeSubmissionDetails } from "../types";

console.log("[CodeLedger] content script loaded on", location.href);

// --- Keep track of which LeetCode account is currently logged in ---------
//
// Best-effort, informational only — the popup shows this so the user can
// see who's currently detected without needing a fresh commit. The actual
// mismatch check in handleSubmission always re-queries live instead of
// trusting this cached value.
getCurrentLeetCodeUsername()
  .then((username) => {
    if (username) void setStored({ leetcode_username_detected: username });
  })
  .catch(() => {});

// --- Detect a finished submission ------------------------------------------
//
// LeetCode's current site never navigates to a new URL when you submit —
// results render inline on the same page. Detection watches for the result
// banner LeetCode itself renders once judging finishes
// (`[data-e2e-locator="submission-result"]`, confirmed against both a live
// screenshot and the open-source reference extension's source, read for
// understanding only — see PRD.md Section 14), then asks LeetCode for the
// most recent submission on this problem to get an id.
const SUBMISSION_RESULT_SELECTOR = '[data-e2e-locator="submission-result"]';
const processedResultElements = new WeakSet<Element>();
let isHandlingResult = false;

function extractTitleSlugFromUrl(): string | null {
  const match = /\/problems\/([^/]+)\//.exec(location.pathname);
  return match ? match[1]! : null;
}

function scanForSubmissionResult(): void {
  const el = document.querySelector(SUBMISSION_RESULT_SELECTOR);
  if (el) void onSubmissionResultVisible(el);
}

async function onSubmissionResultVisible(el: Element): Promise<void> {
  if (processedResultElements.has(el) || isHandlingResult) return;
  // LeetCode creates a fresh element per submission rather than reusing the
  // old one, so tracking already-seen elements (not just "has a result ever
  // appeared") is what lets resubmitting the same problem count as a new
  // event instead of being silently ignored.
  processedResultElements.add(el);
  isHandlingResult = true;

  try {
    console.log(
      "[CodeLedger] submission result detected in the DOM:",
      el.textContent?.trim()
    );

    const titleSlug = extractTitleSlugFromUrl();
    if (!titleSlug) {
      console.warn(
        "[CodeLedger] couldn't determine the problem slug from the URL:",
        location.href
      );
      return;
    }

    const submissionId = await getMostRecentSubmissionId(titleSlug);
    if (!submissionId) {
      console.warn(
        "[CodeLedger] couldn't find a recent submission id for",
        titleSlug
      );
      return;
    }
    console.log("[CodeLedger] using submission id:", submissionId);
    await handleSubmission(submissionId);
  } catch (err) {
    console.error("[CodeLedger] failed to sync submission", err);
    showIndicator("error");
  } finally {
    isHandlingResult = false;
  }
}

const resultObserver = new MutationObserver(scanForSubmissionResult);
resultObserver.observe(document.body, { childList: true, subtree: true });
scanForSubmissionResult();

// --- Fetch, confirm account, and commit ------------------------------------

async function handleSubmission(submissionId: string): Promise<void> {
  showIndicator("pending");
  const details = await fetchSubmissionDetailsUntilGraded(submissionId);

  if (details.statusDisplay !== "Accepted") {
    console.log(
      "[CodeLedger] submission not Accepted, skipping:",
      details.statusDisplay || "(still empty after retries — judging may be slow)"
    );
    clearIndicator();
    return;
  }

  const { gh_token, linked_repo, sync_ready, leetcode_username_confirmed } =
    await getStored([
      "gh_token",
      "linked_repo",
      "sync_ready",
      "leetcode_username_confirmed",
    ]);
  if (!gh_token || !linked_repo || !sync_ready) {
    console.log(
      "[CodeLedger] not connected to GitHub yet — open the popup to connect"
    );
    showIndicator("not-connected");
    return;
  }

  const currentUsername = await getCurrentLeetCodeUsername();
  console.log(
    "[CodeLedger] account check — detected:",
    currentUsername,
    "confirmed:",
    leetcode_username_confirmed
  );
  if (currentUsername && currentUsername !== leetcode_username_confirmed) {
    clearIndicator();
    const shouldContinue = await showAccountConfirmBanner(
      currentUsername,
      leetcode_username_confirmed ?? null
    );
    if (!shouldContinue) return;
    showIndicator("pending");
    await setStored({
      leetcode_username_confirmed: currentUsername,
      leetcode_username_detected: currentUsername,
    });
  } else if (currentUsername) {
    await setStored({ leetcode_username_detected: currentUsername });
  } else {
    console.warn(
      "[CodeLedger] couldn't detect current LeetCode username — account-mismatch check skipped for this commit"
    );
  }

  const files = buildProblemFiles(details);
  await commitProblemFiles(gh_token, linked_repo, files);
  showIndicator("done");

  // Best-effort: the solution is already safely committed by this point, so
  // a stats failure is logged rather than surfaced as a failed sync.
  await updateStats(gh_token, linked_repo, files.folder, details).catch((err) =>
    console.warn("[CodeLedger] couldn't update stats:", err)
  );
}

async function updateStats(
  token: string,
  linkedRepo: string,
  problemFolder: string,
  details: LeetCodeSubmissionDetails
): Promise<void> {
  const { stats } = await getStored(["stats"]);
  const updated = recordSolve(stats ?? emptyStats(), problemFolder, {
    difficulty: details.question.difficulty,
    solvedAt: new Date().toISOString(),
    lang: details.lang,
    title: details.question.title,
  });
  await setStored({ stats: updated });

  // Mirror to the repo so stats survive a reinstall, and store the merged
  // result back locally so this device picks up anything another device
  // recorded.
  const merged = await commitStats(token, linkedRepo, updated);
  await setStored({ stats: merged });
  console.log(
    `[CodeLedger] stats: ${merged.solved} solved (${merged.easy} easy / ${merged.medium} medium / ${merged.hard} hard)`
  );
}

// --- Account confirmation banner -------------------------------------------

function showAccountConfirmBanner(
  detected: string,
  confirmed: string | null
): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.id = "codeledger-mismatch-banner";
    Object.assign(el.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: "10000",
      padding: "12px 14px",
      borderRadius: "8px",
      fontSize: "13px",
      fontFamily: "system-ui, sans-serif",
      color: "#fff",
      background: "#333",
      maxWidth: "300px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
    });

    const message = document.createElement("div");
    message.style.marginBottom = "8px";
    message.textContent = confirmed
      ? `You solved this as "${detected}", but your confirmed account is "${confirmed}".`
      : `Confirm your LeetCode account before committing: "${detected}" — is this you?`;
    el.appendChild(message);

    const continueBtn = document.createElement("button");
    continueBtn.textContent = confirmed
      ? `Continue as ${detected}`
      : "Yes, this is me";
    Object.assign(continueBtn.style, {
      marginRight: "6px",
      padding: "4px 8px",
      cursor: "pointer",
    });

    const skipBtn = document.createElement("button");
    skipBtn.textContent = "Skip this commit";
    Object.assign(skipBtn.style, { padding: "4px 8px", cursor: "pointer" });

    el.appendChild(continueBtn);
    el.appendChild(skipBtn);
    document.body.appendChild(el);

    const cleanup = (result: boolean) => {
      el.remove();
      resolve(result);
    };
    continueBtn.addEventListener("click", () => cleanup(true));
    skipBtn.addEventListener("click", () => cleanup(false));
  });
}

// --- On-page status indicator -----------------------------------------------

function getIndicatorHost(): HTMLElement {
  const existing = document.getElementById("codeledger-indicator");
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = "codeledger-indicator";
  Object.assign(el.style, {
    position: "fixed",
    bottom: "16px",
    right: "16px",
    zIndex: "9999",
    padding: "6px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontFamily: "system-ui, sans-serif",
    color: "#fff",
  });
  document.body.appendChild(el);
  return el;
}

function showIndicator(
  state: "pending" | "done" | "error" | "not-connected"
): void {
  const el = getIndicatorHost();
  if (state === "pending") {
    el.textContent = "CodeLedger: committing…";
    el.style.background = "#555";
  } else if (state === "done") {
    el.textContent = "CodeLedger: committed ✓";
    el.style.background = "#2e7d32";
    setTimeout(clearIndicator, 4000);
  } else if (state === "not-connected") {
    el.textContent = "CodeLedger: not connected — open the popup to connect GitHub";
    el.style.background = "#b8860b";
    setTimeout(clearIndicator, 6000);
  } else {
    el.textContent = "CodeLedger: sync failed (see console)";
    el.style.background = "#c0392b";
    setTimeout(clearIndicator, 6000);
  }
}

function clearIndicator(): void {
  document.getElementById("codeledger-indicator")?.remove();
}
