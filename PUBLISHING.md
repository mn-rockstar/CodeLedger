# Publishing CodeLedger to the Chrome Web Store

Work through this in order. Every step is something you do in a browser, or
text to copy into a form — except one build command.

---

## Already done — nothing to do here

- The extension is built and packaged (see Step 2 to rebuild if you change code)
- Icons at all four sizes exist in [`icons/`](icons/)
- The privacy policy text is written in [`PRIVACY.md`](PRIVACY.md)
- An MIT [`LICENSE`](LICENSE) in your name, and the third-party `ref/` folder
  removed — the repo is safe to make public

## Before you start — have these ready

- [ ] **The project repo pushed to GitHub as public.** This also gives you the
      privacy-policy URL the store requires (Step 7), so it saves a step.
- [ ] **A card for the $5** one-time developer fee.
- [ ] **An email you can check** — you must click a verification link before
      you can submit. This one silently blocks submission at the very end if
      you skip it.
- [ ] **Screenshots at 1280×800** (Step 6 explains what to capture).

---

## ⚠️ Read this first: your extension ID changes

Think of the extension ID as its **address**. Right now Chrome generates that
address from the folder on your disk:

```
omfobemnlapfjooaficlolldciokmkcp
```

When the store accepts your upload it issues a **different, permanent
address** — and two services you set up earlier were told the *old* one:

1. **Your GitHub OAuth App** — GitHub only sends the login result back to an
   address you pre-registered, and that address contains the extension ID.
2. **Your Deno Deploy worker** — it only accepts requests from the extension
   ID hardcoded in [`backend/oauth-worker.js`](backend/oauth-worker.js).

Both reject the new address, so **login fails for everyone who installs it**.

That's why the order below is: upload a draft → read the new ID → update those
two → *then* publish.

> **The uploaded file itself never changes.** Nothing inside it hardcodes the
> ID — [`src/github/oauth.ts`](src/github/oauth.ts) calls
> `chrome.identity.getRedirectURL()`, which asks Chrome at runtime what
> address it's running under. So there is **no rebuild and no second upload**:
> fix the two settings, then publish the draft already sitting there.

---

## Step 1 — Developer account

1. Go to <https://chrome.google.com/webstore/devconsole>
2. Sign in with the Google account that should **permanently own** the
   listing — moving it later is awkward.
3. Pay the **$5 one-time** registration fee.
4. **Settings → Account**: set a publisher display name (shown publicly on
   your listing) and add a contact email, then **click the verification link
   it emails you**.

---

## Step 2 — Build and package

```powershell
npm run typecheck
npm run build:production
```

`build:production` differs from the normal build: it wipes `dist/` first,
minifies, and omits source maps — which would otherwise publish your original
TypeScript and roughly triple the package size.

Then zip the **contents** of `dist/`, not the folder itself:

```powershell
$v = (Get-Content dist\manifest.json | ConvertFrom-Json).version
Compress-Archive -Path dist\* -DestinationPath "codeledger-$v.zip" -Force
```

Check the ZIP has `manifest.json` at its **root**, not inside a `dist/`
subfolder. That's the single most common upload rejection.

---

## Step 3 — Upload as a draft

1. **Add new item**
2. Upload the ZIP
3. **Do not press Publish yet**
4. Copy the extension ID now shown in the dashboard — 32 letters, like
   `abcdefghijklmnopabcdefghijklmnop`

---

## Step 4 — Point your two services at the new ID

**a) GitHub OAuth App** — <https://github.com/settings/developers> → OAuth
Apps → CodeLedger → change the Authorization callback URL to:

```
https://<YOUR-NEW-ID>.chromiumapp.org/
```

**b) Deno Deploy worker** — open your playground and change the first line:

```js
const EXTENSION_ID = "<YOUR-NEW-ID>";
```

Then click **Deploy**.

> **This breaks your local unpacked copy**, which still has the old ID. A
> GitHub OAuth App allows only one callback URL, so to keep developing
> locally, register a **second** OAuth App for development and swap
> `GITHUB_CLIENT_ID` in [`src/github/oauth.ts`](src/github/oauth.ts) when
> working on it. The Deno worker can accept both by turning `EXTENSION_ID`
> into a list and matching the request's `Origin` header against it.

---

## Step 5 — Store listing

**Name**

```
CodeLedger
```

**Short description** (max 132 characters)

```
Automatically commits your Accepted LeetCode solutions and problem statements to a GitHub repository you own.
```

**Detailed description**

```
Code it. Commit it. Track it.

CodeLedger watches LeetCode while you solve problems. The moment a submission
is Accepted, it commits your solution and the problem statement to a GitHub
repository you own — no copying, no pasting, no manual git commands.

WHAT IT DOES

• Detects Accepted submissions automatically as you solve
• Commits your code and the full problem statement to your repo, organised one
  folder per problem (for example, 0001-two-sum/)
• Records runtime and memory statistics in the commit message, so your git
  history doubles as a performance log
• Shows a dashboard in the toolbar popup: problems solved, split by Easy,
  Medium and Hard, plus your current day streak, solves in the last 7 days,
  the language you use most, and your most recent problem
• Warns you before committing if a different LeetCode account is signed in, so
  solves never land in the wrong repository by accident
• Includes a full illustrated guide, opened from Help in the popup

SETUP

Click the toolbar icon, sign in with GitHub, then either create a new private
repository or link one you already have. That's it — solve a problem and it
appears in your repo seconds later.

PRIVACY

No analytics, no tracking, no accounts. Your GitHub token is stored only on
your own device and is never sent anywhere except GitHub. Your solution code
goes only to the repository you chose.
```

**Category** — Developer Tools · **Language** — English

---

## Step 6 — Images

**Screenshots** (at least one required) — exactly **1280×800** or **640×400**,
PNG or JPEG. Worth capturing:

1. The popup dashboard with the donut chart and real numbers
2. A LeetCode page at the moment "committed ✓" appears
3. Your repo showing the generated problem folders

The popup is much smaller than 1280×800, so don't screenshot it alone — the
store rejects wrong dimensions, and an upscaled small image looks bad. Take a
**full browser-window** screenshot with the popup open.

**Store icon** — 128×128, asked for separately from the one in the package.
Upload [`icons/icon-128.png`](icons/icon-128.png).

**Small promo tile** (optional, 440×280) — [`assets/logo.png`](assets/logo.png)
suits this, cropped and resized to exactly 440×280.

---

## Step 7 — Privacy practices tab

This tab is where most first submissions get rejected. Answer honestly.

**Single purpose**

```
Commits the user's Accepted LeetCode solutions to a GitHub repository they own.
```

**Permission justifications** — one per permission requested in
[`manifest.json`](manifest.json):

| Permission | Justification |
|---|---|
| `storage` | Stores the user's GitHub token, linked repository name, and solve statistics locally on their own device. |
| `identity` | Runs the GitHub OAuth sign-in flow so the user can authorise the extension to commit to their repository. |
| `https://leetcode.com/*` | Detects when a submission is Accepted and reads that submission's code and problem statement. This is the core function of the extension. |
| `https://api.github.com/*` | Creates the commits in the user's chosen repository. |
| `https://silver-elephant-7090.mn-rockstar.deno.net/*` | Exchanges the temporary GitHub sign-in code for an access token. That exchange requires a client secret, which cannot safely be included in an extension's files. |
| Remote code | Answer **No**. CodeLedger executes no remotely-hosted code; all logic ships in the package. |

**Data usage** — tick **Authentication information** (the GitHub token) and
**Website content** (the solution code and problem statement). Then certify
all three statements: not sold to third parties, not used for unrelated
purposes, not used for creditworthiness or lending.

**Privacy policy URL** (required) — once the repo is public, use:

```
https://github.com/<your-username>/<repo>/blob/main/PRIVACY.md
```

---

## Step 8 — Submit

Set visibility to **Public** → **Submit for review**. Expect a few hours to a
couple of weeks.

**The question most likely to come back** is the GitHub `repo` scope, which
grants access to all of the user's repositories. The accurate answer: `repo`
is the narrowest scope GitHub's OAuth Apps offer that permits writing to a
private repository — there is no finer-grained option available to them.

---

## After publishing

- **Every update needs the version bumped** in `manifest.json`. The store
  rejects a re-upload of a version it has already seen.
- Updates are reviewed again, usually faster than the first submission.
- Users receive updates automatically within a few hours.
- Your Deno Deploy worker now serves every user's sign-in. It's the one piece
  of shared infrastructure — if it goes down nobody can sign in, though
  existing tokens keep working.
