# CodeLedger — Privacy Policy

_Last updated: 15 August 2026_

CodeLedger is a browser extension that commits your Accepted LeetCode
solutions to a GitHub repository you own. This policy describes exactly what
data it touches and where that data goes.

## Summary

CodeLedger has **no analytics, no tracking, and no user accounts**. It does
not sell or share your data with anyone. Everything it stores lives in your
own browser, and everything it sends goes either to GitHub or to LeetCode —
the two services you are already using.

## What is stored, and where

All of the following is stored using `chrome.storage.local`, which keeps data
**on this device only**. It is deliberately not `chrome.storage.sync`, so
none of it is replicated to Google's servers.

| Data | Why it exists |
|---|---|
| GitHub access token | Authorises commits to your repository |
| GitHub username | Shown in the extension popup |
| Linked repository name (`owner/repo`) | Where solutions are committed |
| LeetCode username | Warns you if a different LeetCode account is about to commit to your repo |
| Solve statistics | The problem folders you've solved and their difficulty, for the popup's counter |

You can erase all of it at any time by clicking **Disconnect** in the
extension popup, or by removing the extension from your browser.

## What is sent, and to whom

**GitHub (`api.github.com`)** — receives your access token, the solution code,
and the problem statement, in order to create commits in the repository you
linked. A `stats.json` file recording your solved-problem counts is also
written to that repository.

**LeetCode (`leetcode.com`)** — the extension reads your submission details
(code, runtime and memory statistics, problem statement) and your signed-in
username using LeetCode's own web API, from within the LeetCode page you are
already logged into. No data is sent *to* LeetCode beyond these ordinary read
requests.

**The token-exchange service (`silver-elephant-7090.mn-rockstar.deno.net`)** —
when you click "Login with GitHub", GitHub issues a short-lived, single-use
authorisation code. That code is sent to this small service, which exchanges
it with GitHub for an access token and returns the token to the extension.
This step exists because the exchange requires a client secret that cannot be
safely included in an extension's files. The service processes the request and
returns a response; it does not store your code, your token, or any other
information about you.

Your solution code is **never** sent anywhere other than the GitHub repository
you chose.

## Repository visibility

CodeLedger commits to whichever repository you link. If you link a public
repository, your solutions will be public. The extension's "create a new
repository" option creates **private** repositories by default.

## Permissions

- **`storage`** — saves the information in the table above on your device.
- **`identity`** — opens GitHub's sign-in window and receives the result.
- **Access to `leetcode.com`** — detects when a submission is accepted and
  reads its details.
- **Access to `api.github.com`** — creates the commits.
- **Access to the token-exchange service** — completes sign-in, as above.

## Changes

If this policy changes, the "last updated" date above will change with it.

## Contact

Questions or requests about this policy: mohitnarvariya70@gmail.com
