# Product Requirements Document

**Working title:** *CodeLedger* (placeholder — just a string in `manifest.json`, rename anytime)
**Author:** you. **Status:** Phases 0–2 complete and verified end to end on the live site (2026-08-14) — solving a problem on LeetCode auto-commits it to GitHub. Kept current as code changes.

### Implementation status (updated as code changes)

- **Built and confirmed working live (verified 2026-08-14):** FR1 (GitHub connect — see auth deviation below), FR2 (create/link repo), FR3 (LeetCode submission detection + GraphQL fetch — see detection deviation below), FR4 (commit to GitHub with 409 retry). A real solve produced the expected `{questionId}-{titleSlug}/` folder containing `README.md` + the solution file.
- **Built, not yet confirmed working live:** FR6 (stats) — popup counter + `stats.json` mirrored to the repo root, with the merge-don't-sum behavior the FR calls for. **Deviation from Section 9's schema:** the spec's `stats.shas` map (a cache of file SHAs, doubling as the per-problem record) was dropped in favour of an explicit `stats.problems` map of `{ [folder]: { difficulty } }`, and the four counts are always *recomputed* from that map rather than incremented. The SHA cache was only ever an optimization to skip a `GET` before each `PUT` — FR4 already reads the SHA live, which is simpler and can't go stale — and deriving the counts instead of incrementing makes double-counting structurally impossible rather than something the merge logic has to correct for.
- **Phase 6 (ship) in progress:** icons generated (`tools/make-icons.mjs` draws them from scratch — no image library), a production build mode added (`npm run build:production` — minified, no source maps), `host_permissions` narrowed to only what's actually fetched (dropped an unused `github.com` entry and a `*.deno.dev` wildcard), plus a privacy policy (`PRIVACY.md`) and a Chrome Web Store submission walkthrough (`PUBLISHING.md`). **Blocking issue documented there:** the store assigns a new permanent extension ID, which invalidates both the GitHub OAuth App callback URL and the Deno worker's CORS check — those must be updated between uploading a draft and publishing. Answers Section 13's open questions: name stays *CodeLedger*, and the decision is to publish publicly.
- **Section 14 discharged (2026-09-06):** the project ships under **MIT, © 2026 Mohit Narvariya** (`LICENSE` at the repo root), and the `ref/` checkout of the LeetHub extension has been deleted — it was reference material only and was never part of the build. What was taken from reading it during the FR3 detection work were facts about third parties (the `data-e2e-locator="submission-result"` element LeetCode renders; language-to-extension mappings), not expression. Section 14's goal — 100% original code, free to license and publish under the author's own name — holds.
- **Known limitation (FR6):** `stats.json` is keyed by problem folder only, so it has no record of *which* LeetCode account solved what. Two LeetCode accounts committing to the same repo produce one combined count with no way to separate them. Cross-*device* sync does work (the popup reconciles against the repo in the background on open), and switching *GitHub* accounts clears local stats so counts can't leak between repos.
- **Beyond FR2 (v0.9):** the spec's link-repo step took a bare `owner/repo` string. In practice that was the single most confusing point of the whole setup — the first instinct is to type just the repo name, or paste the URL from the address bar, and both were rejected. `parseRepoInput` now accepts the browser URL, a `.git` clone URL, an SSH remote, `owner/repo`, or a bare repo name resolved against the signed-in account, and echoes the resolved `owner/repo` back in any error so a wrongly-inferred owner is visible. Non-GitHub hosts still fail closed.
- **Branding + onboarding (v0.7–0.8):** the user supplied logo artwork (`assets/logo.png`, a wide lockup) which now drives the extension icons — `tools/logo-icons.mjs` hand-rolls PNG decode/crop/resample (no image library in the project) to letterbox the square terminal mark onto a rounded tile, and falls back to a tighter `>_`-only crop at 16px where the window chrome would otherwise collapse into mush. Design tokens moved to a shared `theme.css`. A first-run `welcome.html` (pin the icon → connect GitHub → solve something) opens via a new minimal service worker on `onInstalled` — unrelated to the removed detection worker. The artwork also settles the tagline: **"Code it. Commit it. Track it."** Note the logo's green fails WCAG as text on the light theme (measured 2.08:1 against 4.5:1 required), so light mode uses a darkened step of the same hue and dark mode keeps the authentic colour.
- **Schema addition (v0.6):** each record in `stats.problems` now also carries an optional `solvedAt`, `lang` and `title`, which power four KPI tiles in the popup (day streak, solves in the last 7 days, top language, last solved). All three are optional and the derived metrics skip records lacking them, so older `stats.json` files stay valid — but the metrics only begin accumulating from the first solve after upgrading.
- **Beyond FR10's spec:** the connected popup is a small dashboard rather than a text readout — an identity block (GitHub account, LeetCode account, linked repo) above a donut chart of solved problems with the total as a centred hero figure, plus a legend giving each difficulty's count and share. Difficulty is encoded as a single-hue *ordinal* ramp (light Easy → dark Hard) rather than three unrelated hues, because Easy/Medium/Hard is an ordered scale and the ordering should read in the color; the ramp steps are validated for lightness monotonicity, step separation, and surface contrast in both light and dark themes.
- **Not yet built:** FR5 (topic-grouped root README), FR7 (notes), FR8 (manual sync button), FR9 (GeeksforGeeks). Firefox manifest also not started.
- **Deviation from Section 8's auth design:** FR1 originally specified a pasted fine-grained Personal Access Token specifically to avoid needing a backend. That was built first, then fully replaced at the user's request with real GitHub OAuth (a "Login with GitHub" button via `chrome.identity.launchWebAuthFlow`), backed by a small Deno Deploy function that holds the OAuth Client Secret and does the code-for-token exchange — i.e. the v2 enhancement Section 8 described as optional is now what's actually shipped. Trade-off accepted: OAuth Apps only grant broad `repo` scope (all repos), unlike the fine-grained single-repo PAT.
- **Deviation from FR3's detection design:** the original spec (and the background service worker + `chrome.webNavigation` it called for) assumed LeetCode navigates to a `/submissions/<id>/` URL after a submit — confirmed via live testing that the current LeetCode site no longer does this at all (results now render inline on the same page). Detection was rebuilt twice: first around intercepting the page's own `submit/` network call (patching `window.fetch`), then — after cross-checking against the original open-source LeetHub extension's source for understanding (not copied; see Section 14) — around watching for the `[data-e2e-locator="submission-result"]` element LeetCode itself renders when judging finishes, then querying LeetCode's "most recent submission for this problem" for an id. The background service worker (`src/background.ts`) was removed entirely — no longer needed. After this, the user asked for a full rewrite of the whole codebase (keeping the GitHub OAuth Client ID and Deno Deploy backend unchanged, since neither was ever broken) to eliminate any leftover code from the two abandoned detection approaches — the DOM+GraphQL approach described above is what the rewrite kept and cleaned up, not a fourth new approach.
- **Feature beyond the original FRs:** a LeetCode account confirmation system — confirms which LeetCode account is "yours" (explicit click, even on the first solve) and shows an in-page Continue/Skip banner if a future commit's detected LeetCode account differs from the confirmed one. Not in the original spec; added because multiple people/accounts could otherwise have their solves silently committed to the same repo.
- Full current file-by-file breakdown: see `README.md` in this folder.

### How to use this document

This file is written to be **self-contained**: everything you need to build the extension — API shapes, algorithms, data formats — is described here in plain language, not "go read file X and copy it." You should be able to build the whole codebase from this document alone, without opening `LeetHub-2.0-main/` at all. That's intentional: it keeps your project a clean, independent implementation of the same *idea* (watch a judge site, commit accepted solutions to GitHub), not a derivative of anyone else's *code*. See Section 14 for why that distinction matters and how to keep it that way while you build.

---

## 1. Summary

A Chrome + Firefox extension that watches LeetCode and GeeksforGeeks while you solve problems, and — the moment a submission is Accepted — automatically commits your solution and the problem statement to a GitHub repository you own. No copy-pasting, no manual `git add`.

Everything about it — name, branding, code, GitHub app, published listing — is entirely yours, written from scratch by you from the specification below.

## 2. Goals

- **G1.** On every Accepted submission (LeetCode or GFG), auto-commit the code + problem statement — zero manual steps.
- **G2.** Keep the target repo self-organizing: one folder per problem, root README grouped by topic.
- **G3.** Track running stats (solved / easy / medium / hard) in the toolbar popup.
- **G4.** Ship under your own name, no embedded secrets, and a codebase that is entirely your own original work (Section 14).
- **G5.** Double as a learning project — understand *why* each piece works, not just have working code.

## 3. Non-goals for v1

- Other judges (Codeforces, HackerRank, etc.) — LeetCode + GFG only.
- A hosted backend server — the recommended auth approach needs none.
- Backward compatibility with old/legacy site UIs — build against whatever LeetCode and GFG look like *now*.
- Multi-user / SaaS — single-user tool, optionally installable by others with no shared server.

## 4. Users

Just you, day one. Optionally anyone who installs it later and connects their own GitHub account — the extension never sees or stores anyone's data but the local user's.

## 5. Core user journey

1. Install → popup → **Connect GitHub** (paste a personal access token, Section 8).
2. **Create a new private repo** or **link an existing one**.
3. Solve a problem on LeetCode/GFG → Submit → Accepted.
4. Spinner near Submit, then a checkmark — committed in the background.
5. GitHub now has `0001-two-sum/README.md`, `0001-two-sum/two-sum.py`, and the root README lists it under "Array"/"Hash Table".
6. Click the toolbar icon anytime → `Solved: 42 (20 easy / 18 medium / 4 hard)`.

## 6. Functional requirements

Each requirement is written with enough detail — API calls, algorithms, data shapes — to implement directly. Where a detail isn't covered here (an exact selector, a field name), get it from the live site's dev tools yourself — that's ordinary, independent engineering, not "referencing someone else's code."

### FR1 — Connect GitHub (token-based, not OAuth)
Popup shows a **Connect GitHub** input when no token is stored. On submit:

```
GET https://api.github.com/user
Authorization: Bearer <pasted token>
Accept: application/vnd.github+json
```

- `200` → read `login` as the username; store `{ token, username }` in `chrome.storage.local`.
- `401` → show "That token isn't valid", don't store it.

Re-run this same check whenever the popup opens with a token already stored, since tokens can be revoked or expire.

### FR2 — Repo setup
**Create:**
```
POST https://api.github.com/user/repos
{ "name": <input>, "private": true, "auto_init": true, "description": <yours> }
```
`201` → read `full_name`, store as linked repo. `422` → name taken, suggest linking instead.

**Link:**
```
GET https://api.github.com/repos/{owner}/{repo}
```
`200` → store `full_name` as linked. `404` → not found. `403` → no write access.

### FR3 — Detect a LeetCode submission and fetch its details
- LeetCode is an SPA — the Submit button appears/disappears without full reloads. Use a `MutationObserver` on `document.body` to attach a click listener once it exists, and separately listen for Ctrl/Cmd+Enter on the code editor.
- The post-submit URL (`/submissions/<id>/`) is a History-API navigation, not a real page load. In the background service worker, use `chrome.webNavigation.onHistoryStateUpdated` (filtered to `leetcode.com`, URL containing `submissions`) to catch it and extract the id via `/\/submissions\/(\d+)\//`. Relay it to the content script with `chrome.runtime.sendMessage`.
- With the id, `POST` to `https://leetcode.com/graphql/` (LeetCode's own public API — called from a content script on that origin, so your session cookie rides along automatically). You need a query returning at minimum: `runtime`, `runtimeDisplay`, `runtimePercentile`, `memory`, `memoryDisplay`, `memoryPercentile`, `code`, and the nested question's `questionId`, `title`, `titleSlug`, `content`, `difficulty`, `topicTags`. Find the exact query shape by watching the Network tab while using leetcode.com yourself — that's the officially-shaped request for their own public API.

### FR4 — Commit to GitHub (the core of the project)
File layout: `{questionId, 4-digit zero-padded}-{titleSlug}/README.md` and `.../{titleSlug}.{ext}`.

```
PUT https://api.github.com/repos/{owner}/{repo}/contents/{path}
Authorization: Bearer <token>
{ "message": <string>, "content": <base64>, "sha": <only when overwriting> }
```

UTF-8-safe base64 (generic JS technique, not project-specific):
```js
const encode = s => btoa(unescape(encodeURIComponent(s)));
const decode = b => decodeURIComponent(escape(atob(b)));
```

**Conflicts:** a `409` means your `sha` is stale — `GET` the same URL for the current `sha`, retry the `PUT`.

**Language → extension:** build your own lookup table keyed by whatever language string LeetCode's API returns (discovered via FR3).

**Commit message:** include the run's stats, e.g. `"Time: {runtimeDisplay} ({runtimePercentile}%), Memory: {memoryDisplay} ({memoryPercentile}%)"`.

### FR5 — Self-organizing root README
Format — one delimited block in the root `README.md`:
```markdown
<!--TOPICS:START-->
## Array
| Problem |
|---|
| [0001-two-sum](...) |
<!--TOPICS:END-->
```
On each solve: `GET` the root README → locate/create the block → for each topic tag, find/create its heading+table, dedupe against existing rows, append if new → re-sort each table numerically by problem number → re-encode and `PUT` (409-handled like FR4).

### FR6 — Stats
Schema in Section 9. Locally increment `solved/easy/medium/hard` on each *first-time* solve. Mirror to a `stats.json` at repo root via FR4. On `409`, don't overwrite blindly — `GET` the existing file, merge by recomputing counts from the union of both sides' per-problem records (not summing, so nothing double-counts), then `PUT` the merged result.

### FR7 — Notes (nice-to-have)
If LeetCode's notes panel has content for the problem, commit it as `NOTES.md`. You'll need to find where notes are currently exposed (DOM or GraphQL) yourself — UI details drift; treat this as optional polish, not a blocker.

### FR8 — Manual sync fallback
A small "Sync now" button injected on the submission-result page; on click, re-runs FR3 (using the id already in the URL) + FR4 manually, for the rare case auto-detection misses one.

### FR9 — GeeksforGeeks support
No public API like LeetCode's — pure DOM scraping: watch for the page's "solved successfully" confirmation, read title/difficulty from their header elements, problem statement from the description container, and code from whatever editor GFG currently uses (inspect the live page — many embedded editors expose a JS API for reading the current value). Commit via FR4's logic. Expect to revisit this occasionally as GFG's UI changes.

### FR10 — Popup UI states
No token → connect prompt (FR1). Token, no repo → repo setup (FR2). Both present → live stats (FR6), reset control, repo link.

## 7. Non-functional requirements

- **Security** — no secret embedded in the extension (Section 8); token only in `chrome.storage.local`.
- **Manifest V3** for Chrome; Firefox's manifest differs mainly in how the background worker is declared.
- **Resilience** — GitHub `409`s retry-and-merge, never fail silently.
- **Cost** — the token approach needs no backend: free forever, any number of installs.

## 8. Security & GitHub auth — the decision you asked me to make

The mistake to avoid: a full OAuth App flow needs a `CLIENT_SECRET`, and an extension is just unpacked static files — anyone can read a secret out of it.

**Build a fine-grained Personal Access Token flow instead:**
1. Generate a fine-grained token at `github.com/settings/personal-access-tokens/new`, scoped to one repo, **Contents: Read and write** only.
2. Paste it into the popup once (FR1).
3. Store it in `chrome.storage.local` — this device only, deliberately not `chrome.storage.sync`.
4. Every commit goes straight from your browser to `api.github.com` over HTTPS — no third party, no server in the middle.

No `CLIENT_SECRET` exists anywhere, so nothing can leak, and there's no backend to build or host. Trade-off: pasting a token is one step less slick than an "Authorize" button — that would need a small backend later; treat it as an optional v2, not a v1 requirement.

## 9. Data model

All in `chrome.storage.local`:

| Key | Type | Purpose |
|---|---|---|
| `gh_token` | string | The user's GitHub PAT |
| `gh_username` | string | From `GET /user`, shown in the popup |
| `linked_repo` | string | `"owner/repo"` |
| `sync_ready` | boolean | Whether FR1+FR2 setup is complete |
| `stats` | object | `{ solved, easy, medium, hard, shas: { [slug]: { [file]: sha } } }` |

## 10. Technical architecture

- Manifest V3, one background service worker (needed for FR3), content scripts on `leetcode.com` and `practice.geeksforgeeks.org` only — no `github.com` script needed at all with token-based auth.
- Any modern bundler (webpack/esbuild/vite) compiling content script(s), popup, and setup page into a `dist/` folder alongside `manifest.json` — standard extension build setup, researched fresh from MDN/Chrome extension docs.
- APIs: LeetCode's GraphQL endpoint (rides your session cookie) and GitHub's REST API (Contents, `/user`, `/repos`).

```
manifest-chrome.json
manifest-firefox.json
popup.html / src/popup.js
setup.html / src/setup.js
src/background.js
src/leetcode/detect.js       (FR3)
src/leetcode/github.js       (FR4)
src/leetcode/readme.js       (FR5)
src/stats.js                 (FR6)
src/gfg.js                   (FR9)
```

## 11. Roadmap

| Phase | Goal | Done when | Status |
|---|---|---|---|
| 0. Scaffolding | Bare MV3 manifest, empty popup, logging content script | Loads unpacked, log appears | ✅ Done |
| 1. GitHub connection | FR1 + FR2 | Connect GitHub, create/link a repo | ✅ Done (via OAuth, not a pasted PAT — see Implementation Status above) |
| 2. Capture + commit | FR3 + FR4 | Solving a problem creates both files — the heart of the project | ✅ Done, confirmed on a real submission |
| 3. Organization + stats | FR5 + FR6 | Root README groups by topic; popup shows live counts | Not started |
| 4. GFG support | FR9 | Same behavior on GFG | Not started |
| 5. Polish | FR7, FR8, FR10, branding, Firefox manifest | Feels finished on both browsers | Not started |
| 6. Ship | — | Tested both browsers; publish or keep personal | Not started |

## 12. If you get stuck

This document is meant to be enough on its own. If you get stuck on a specific piece and want to see one prior solution, you can search for other open-source LeetCode-to-GitHub sync extensions and read one for understanding — then **close the file and write your own version**. Don't copy-paste blocks of someone else's source into your project; that's the one thing that would create a real licensing entanglement (Section 14). Section 6 was written specifically to make that detour unnecessary.

## 13. Open questions for you

None of these block starting Phase 0:
1. **Final name** — no rush.
2. **Publish or keep personal?** Chrome Web Store is a one-time $5 fee, Firefox Add-ons is free; either needs a privacy policy/icons/screenshots eventually, not before you start.
3. **Which repo** receives the commits?
4. **JS or TypeScript?** Suggest plain JS to start — fewer moving parts while learning two APIs at once; TS migration later is mechanical.

## 14. Why this stays license-clean

Copyright protects a specific piece of *written code*, not the general idea of "watch a coding-judge site and commit accepted solutions via a REST API." That idea, and the individual techniques involved (calling a public GraphQL API, `PUT`ting base64 content to GitHub's Contents API, retrying on a `409`) are ordinary, widely-used patterns — not owned by any one project.

Section 6 describes exactly what to build in plain language so you write an **original implementation** of each piece rather than copying a file. Do that, and there's no license obligation to anyone: you own 100% of the code, free to name, brand, license, and publish however you want.

The only thing that *would* create an obligation is copy-pasting someone else's actual source (verbatim or lightly modified) into your project — most comparable open-source projects, including the one you looked at earlier, are MIT-licensed, which permits that but requires keeping the original copyright notice attached to whatever you copied. Section 12 covers how to avoid ever needing to make that call: read for understanding, write it yourself.

---

**Saved at:** `d:\data\LeetHub-2.0-main\PRD.md` (a plain-text copy lives alongside it as `PRD.txt`)
