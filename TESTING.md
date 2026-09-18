# How to Run and Test CodeLedger

This is a step-by-step guide for actually trying out the extension in your
browser. Follow it top to bottom the first time.

**Note:** the popup now has a "Login with GitHub" button instead of a paste-a-token
box. Before that works, you need to do the one-time OAuth setup in the section
near the bottom of this file ("Setting up Login with GitHub"). Everything else
below (build, load unpacked, etc.) is unchanged.

---

## Step 0 — One-time setup check

Building this project needs **Node.js** (a program that runs the build
tools, not something you type as a command — just the name of the software).
It's installed on this machine, but only as a "portable" copy rather than
through the normal Windows installer, so Windows doesn't yet know where to
find it automatically in a terminal.

**Every time you open a new terminal window to work on this project, paste
this line first** (this points that terminal at Node.js for its current
session only — harmless, and safe to run every time, even if it's already
working):

```
$env:PATH = "$env:LOCALAPPDATA\nodejs-portable\node-v24.19.0-win-x64;$env:PATH"
```

If you ever see `npm is not recognized` or `node is not recognized`, this is
the fix — run the line above, then retry your command.

---

## Step 1 — Build the extension

Every time you (or I) change the code in the `src/` folder, it needs to be
rebuilt into plain JavaScript before Chrome can use it.

Open a terminal in this folder (`d:\data\LeetHub-2.0-main\Mine`), run the
Step 0 line above if you haven't in this window yet, then run:

```
npm install
npm run build
```

- `npm install` only needs to be run once (or again if new dependencies get
  added later) — it downloads the build tools.
- `npm run build` needs to be run **every time the code changes**. It
  produces a `dist` folder — that's the actual folder Chrome loads.

You should see output ending in `Build complete -> dist/` with no red error
text above it.

---

## Step 2 — Load it into Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** — a toggle switch in the top-right corner.
3. Click **Load unpacked** (top-left).
4. In the file picker, select the `dist` folder specifically:
   `d:\data\LeetHub-2.0-main\Mine\dist`
5. A "CodeLedger" card should appear in your list of extensions.

Pin it to your toolbar for easy access: click the puzzle-piece icon in
Chrome's toolbar, find CodeLedger, click the pin icon next to it.

**Whenever the code is rebuilt (Step 1 again), TWO reloads are needed —
this trips people up constantly:**

1. Go to `chrome://extensions` and click the circular reload icon on the
   CodeLedger card. Chrome doesn't notice file changes on its own.
2. **Then press F5 on any leetcode.com tab you already had open.**

Step 2 is the one that's easy to forget. The part of the extension that
runs *inside* the LeetCode page is injected when the page loads, so a tab
opened before the reload keeps running the **old** code — even though
`chrome://extensions` shows the new version number. Symptoms of forgetting
it are confusing: some features work (they existed in the old build) while
new ones silently do nothing.

Quick way to confirm which build a tab is running: the version number in
the manifest is bumped on every change, and the popup reflects the new
build immediately — but the in-page behavior won't until you refresh the
tab.

---

## Step 3 — Connect the extension to GitHub

This needs the one-time OAuth setup at the bottom of this file
("Setting up Login with GitHub") to be done first. After that:

1. Click the CodeLedger icon in your browser toolbar.
2. Click **Login with GitHub**, and approve the authorisation window.
3. You'll now see two options:
   - **Create a new private repo** — type a name and click **Create repo**.
   - **Link an existing repo** — paste the repo's GitHub link (or just type
     its name, in which case your own account is assumed) and click
     **Link repo**.
4. Once successful, the popup shows your dashboard — GitHub account, linked
   repo, and a solved counter. Setup is done.

---

## Step 4 — Test it on a real LeetCode problem

1. Go to `https://leetcode.com` and open any problem.
2. Write a solution (or paste one you know is correct) and click **Submit**
   (or press Ctrl+Enter / Cmd+Enter).
3. Wait for LeetCode to show **Accepted**.
4. Watch the bottom-right corner of the page — a small dark box should
   briefly say **"CodeLedger: committing…"**, then turn green and say
   **"CodeLedger: committed ✓"**.
5. Open your GitHub repo in a browser tab. You should see a new folder like
   `0001-two-sum/` containing:
   - `README.md` — the problem statement
   - a solution file (e.g. `two-sum.py`) — your submitted code
6. Check that the commit message on that folder mentions runtime/memory
   stats.

If you only get "Wrong Answer" or another non-Accepted result, nothing
should happen — that's correct behavior, it only commits on Accepted.

---

## Step 5 — If something doesn't work

Open developer tools on the LeetCode tab: press **F12**, click the
**Console** tab. Every message from this extension starts with
`[CodeLedger]` — that's what to look for.

Things worth checking first:

- **Nothing happens at all after Submit** — most often the tab is running an
  older content script. Refresh the LeetCode tab (see Step 2) before
  suspecting anything else.
- **Another LeetCode extension is enabled** — a second extension's content
  script can commit on its own and make it look like this one ran. Check
  your extensions page and disable anything similar while testing.
- **Console shows an error mentioning "GraphQL"** — the request asking
  LeetCode for your submission details may need adjusting to match a change
  on their side. Copy the exact error text; it's usually a small fix.

After any code change, repeat Step 1 (rebuild) *and* both reloads in Step 2.

---

## Setting up "Login with GitHub" (one-time)

The popup's "Login with GitHub" button needs two things you set up once:
a GitHub OAuth App, and a tiny free script hosted on Deno Deploy that safely
holds one secret value the extension itself is never allowed to see.

### A. Register a GitHub OAuth App

1. Go to `https://github.com/settings/developers` → **OAuth Apps** →
   **New OAuth App**.
2. **Application name:** anything, e.g. `CodeLedger`.
3. **Homepage URL:** anything, e.g. your GitHub profile URL.
4. **Authorization callback URL:** exactly
   `https://<your-extension-id>.chromiumapp.org/` — find your extension's ID
   on its card at `chrome://extensions`. It's the 32-letter string shown
   under the description.
5. Click **Register application**.
6. Copy the **Client ID** shown on the resulting page — safe to share with
   me, it's public by design.
7. Click **Generate a new client secret** and copy it — **do not share this
   one with me or paste it into any file**. It goes only into Deno Deploy
   in the next section.

### B. Deploy the token-exchange script on Deno Deploy

1. Go to `https://dash.deno.com` and sign in with your GitHub account.
2. Create a new **Playground** project.
3. Open the file `backend/oauth-worker.js` in this project, copy its
   contents, and paste them into the Deno Deploy editor, replacing the
   placeholder file.
4. In that pasted code, replace `REPLACE_WITH_EXTENSION_ID` and
   `REPLACE_WITH_CLIENT_ID` with your real values from Section A.
5. In the Deno Deploy project's **Settings → Environment Variables**, add:
   `GITHUB_CLIENT_SECRET` = (the client secret from Section A, step 7).
6. Deploy/save. Note the project's URL, something like
   `https://your-project-name.deno.dev`.

### C. Send me the two non-secret values

Tell me:
- Your GitHub OAuth App's **Client ID**
- Your Deno Deploy project's URL (e.g. `https://your-project-name.deno.dev`)

I'll plug both into `src/github/oauth.ts`, rebuild, and you'll reload the
extension in `chrome://extensions` and test the "Login with GitHub" button.

---

## Quick reference — the commands you'll use most

```
$env:PATH = "$env:LOCALAPPDATA\nodejs-portable\node-v24.19.0-win-x64;$env:PATH"   # once per new terminal window
npm run build                                                                      # after any code change
```

Then in `chrome://extensions`: click the reload icon on the CodeLedger card.
