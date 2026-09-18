// Minimal service worker. Its only job is opening the welcome page on a
// fresh install — deliberately not on updates, which would reopen it on
// every version bump.
//
// (An earlier worker watched for LeetCode URL changes to detect submissions.
// That approach doesn't work against the current LeetCode site and was
// removed; detection lives entirely in the content script now. This one is
// unrelated to it.)

/** Compact standalone window rather than a full tab — the onboarding is a
 *  short checklist, and a full-width page leaves it stranded in whitespace. */
const WELCOME_WINDOW = { width: 500, height: 720 };

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  chrome.windows.create({
    url: chrome.runtime.getURL("welcome.html"),
    type: "popup",
    width: WELCOME_WINDOW.width,
    height: WELCOME_WINDOW.height,
  });
});
