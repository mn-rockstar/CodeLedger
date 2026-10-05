# CodeLedger

**Code it. Commit it. Track it.**

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/ppkdfibnadlafpilkffihlmnedmlleja)
· [Source](https://github.com/mn-rockstar/CodeLedger)
· [Privacy policy](PRIVACY.md)

A Chrome extension that watches LeetCode while you solve problems and — the
moment a submission is **Accepted** — automatically commits your solution
and the problem statement to a GitHub repository you own. No copy-pasting,
no manual `git add`.

Full original spec: [`PRD.md`](PRD.md) / [`PRD.txt`](PRD.txt).
Step-by-step setup and testing walkthrough: [`TESTING.md`](TESTING.md).

## Status

**Confirmed working live** — the full solve → commit pipeline was verified
end to end on 2026-08-14:
- Real "Login with GitHub" (OAuth), not a pasted token
- Create a new repo, or link an existing one by pasting whatever's to hand —
  the browser URL, a clone URL, `owner/repo`, or just the bare repo name
  (which resolves against the signed-in account). `parseRepoInput` in
  [`src/github/client.ts`](src/github/client.ts) normalises all of them and
  rejects non-GitHub hosts.
- Detects an Accepted LeetCode submission by watching for the result banner
  LeetCode itself renders inline (`[data-e2e-locator="submission-result"]`),
  then asking LeetCode for the most recent submission on that problem to
  get an id. LeetCode's current site never navigates to a new URL on
  submit, so there's no URL change to watch — this replaced two earlier
  approaches (URL-watching, then network-interception) that turned out not
  to match the live site.
- Fetches the submission's code, runtime/memory stats, and problem
  statement from LeetCode's GraphQL API, retrying for a few seconds if
  LeetCode is still judging when first asked
- Commits `README.md` (problem statement) + the solution file to
  `{questionId}-{titleSlug}/` in your repo, with 409-conflict retry
- Confirms which LeetCode account is "yours" once (explicit click, even on
  the first solve) and warns — with a Continue/Skip choice — if a future
  commit is about to happen under a different logged-in LeetCode account
- Visible in-page status (committing… / committed ✓ / not connected /
  sync failed) near the bottom-right of the LeetCode page. Note this
  auto-clears after a few seconds, so it's easy to miss — the commit still
  completes if you switch tabs, since the content script keeps running.

**Built, not yet confirmed working live:**
- Stats counter (PRD FR6) — counts are always *derived* from a per-problem
  map rather than incremented, so re-solving a problem or merging two
  devices can't double-count. Mirrored to a `stats.json` at your repo root
  so counts survive a reinstall or a second device.
- Popup dashboard — frosted glass panels over a gradient. A donut chart of
  solved problems with the total as the centred hero figure and a legend
  giving each difficulty's count and share; four KPI tiles (day streak,
  solves in the last 7 days, top language, last solved + how long ago); and
  an identity panel with the GitHub account, LeetCode account and linked
  repo. Two-step "Reset stats" control. Light and dark themes.

  The difficulty colours are one blue ramp light→dark rather than three
  unrelated hues, because Easy→Hard is an *ordered* scale — the reader sees
  the ordering in the colour. Both modes' steps are validated against the
  card surface they actually sit on (the dark "hard" step is a notch
  lighter than you'd expect, because the frosted panel lifts the dark
  surface and the darker step fell below the contrast floor against it).

### How stats behave across devices and accounts

- **Same GitHub + same repo on a second machine:** the popup renders local
  counts immediately, then reconciles against the repo's `stats.json` in the
  background, so a freshly-connected device shows its real totals without
  waiting for a solve.
- **Switching GitHub accounts:** local stats are cleared along with the repo
  link, so one account's counts can't be merged into another account's repo.
- **Switching LeetCode accounts:** `stats.json` is keyed by problem folder
  only, so solves from different LeetCode accounts pointed at the same repo
  are counted together with no way to separate them. Per-account stats are
  not implemented.

**Not yet built:**
- Grouping solved problems by topic in the root README (PRD FR5)
- GeeksforGeeks support (PRD FR9)
- Notes, manual "Sync now" button, Firefox manifest (PRD FR7/FR8, polish)
- A soft LeetCode-username-vs-GitHub-username sanity display (discussed,
  not yet built)

## Tech stack

TypeScript, bundled with esbuild, Manifest V3. No frontend framework —
popup and content script UI are built with plain DOM APIs.

GitHub OAuth needs a client secret, which can't live in extension code, so
there's a small companion backend: a ~20-line script
([`backend/oauth-worker.js`](backend/oauth-worker.js)) deployed on Deno
Deploy that does only the code-for-token exchange.

## Project structure

```
manifest.json               Extension manifest (MV3), copied into dist/ on build
package.json / tsconfig.json / scripts/build.mjs   Build tooling (esbuild)
theme.css                   Shared design tokens for every extension page
popup.html                  Popup window markup + its layout CSS
welcome.html                First-run onboarding page (opens on install)
assets/logo.png             Source logo artwork (wide lockup)
icons/                      Generated PNG icons (16/32/48/128)
tools/logo-icons.mjs        Crops the square mark out of the logo and scales
                             it — hand-rolled PNG decode/resample, since the
                             project has no image library
backend/oauth-worker.js     Reference copy of the Deno Deploy OAuth backend
PRIVACY.md                  Privacy policy (needs a public URL to submit)
PUBLISHING.md               Chrome Web Store submission walkthrough

src/
  background.ts             Service worker — opens welcome.html on first install
  types.ts                  Shared data shapes (StoredData, Stats, LeetCode types)
  storage.ts                Typed chrome.storage.local helpers
  stats.ts                  Pure stats logic — derive counts from the
                             per-problem map, merge two devices' stats, and
                             compute the KPI metrics (streak, last 7 days,
                             top language, last solved)
  github/
    client.ts                GitHub auth check, create/link repo
    contents.ts               Commit files via GitHub's Contents API (409 retry,
                               language→extension mapping, file layout,
                               stats.json merge-on-conflict)
    oauth.ts                  chrome.identity-based "Login with GitHub" flow
  leetcode/
    graphql.ts                LeetCode GraphQL queries: submission details
                               (with retry until grading finishes), most
                               recent submission id for a problem, currently
                               signed-in username
    content-entry.ts          Content script: watches for LeetCode's own
                               inline result banner via MutationObserver,
                               account confirmation banner, orchestrates the
                               fetch→commit pipeline, on-page status indicator
  popup/
    popup.ts                  Popup UI: connect GitHub, repo setup, and the
                               connected dashboard (identity + stats)
    donut.ts                  SVG donut renderer for the difficulty breakdown
```

Submission detection runs entirely in the content script. The service worker
has nothing to do with it — it only opens the welcome page on install. An
earlier worker *did* handle detection, watching for the LeetCode URL
changing to a `/submissions/<id>/` page via `chrome.webNavigation`, but that
stopped working once LeetCode redesigned their results page to render inline
without changing the URL; it was replaced by the DOM/GraphQL detection
described above.

`dist/` is the built output (gitignored) — that's the folder you point
Chrome's "Load unpacked" at, never the project root.

## Development

```
npm install
npm run typecheck
npm run build              # dev build: source maps, unminified
npm run build:production   # store build: clean dist/, minified, no source maps
npm run icons              # regenerate icons/ (only after editing the design)
```

After rebuilding, **two** reloads are needed: the reload icon on the
CodeLedger card at `chrome://extensions`, *and* F5 on any already-open
leetcode.com tab — content scripts are injected at page load, so an open tab
keeps running the old code. See [`TESTING.md`](TESTING.md) for the full
first-time setup (Node.js/PATH notes, GitHub OAuth App, Deno Deploy backend)
and a step-by-step live test.

## Publishing

See [`PUBLISHING.md`](PUBLISHING.md). The critical detail: the Chrome Web
Store assigns a **new permanent extension ID**, which invalidates both the
GitHub OAuth App's callback URL and the Deno worker's CORS check — so upload
a draft first, read the assigned ID, update those two, and only then publish.

## License

MIT — see [`LICENSE`](LICENSE). © 2026 Mohit Narvariya.

Every file under `src/` is original work, written from the plain-language
specification in [`PRD.md`](PRD.md) rather than adapted from any existing
extension. The PRD was deliberately written to describe *what to build* —
the API calls, data shapes and algorithms — precisely so the implementation
could be written independently; see its Section 14.

During development the open-source LeetHub extension was read for
understanding when LeetCode's own behaviour was unclear. What that
confirmed were **facts about third parties**, not code: that LeetCode
renders a `data-e2e-locator="submission-result"` element when judging
finishes, and which file extensions correspond to which languages. No
source was copied, and a checkout of it is no longer kept in this
repository.

## Known gotchas

- If commits seem to happen without any of CodeLedger's own logic firing
  (no confirmation banner, no status indicator), check `chrome://extensions`
  for **other** LeetCode-related extensions that might also be enabled — a
  second extension's content script can race ahead of this one and do its
  own thing silently.
- If a newly-built feature appears to do nothing while older features still
  work, the open LeetCode tab is almost certainly running the previous
  content script. Refresh the tab (see Development above).
