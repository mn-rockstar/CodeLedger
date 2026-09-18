// Fill these in once you've registered the GitHub OAuth App and deployed the
// Deno Deploy worker (see backend/oauth-worker.js). Both values are public
// (safe to hardcode) — the actual secret lives only in Deno Deploy's env vars.
const GITHUB_CLIENT_ID = "Ov23li9KCLHZRJDYkhZc";
const WORKER_EXCHANGE_URL = "https://silver-elephant-7090.mn-rockstar.deno.net";

export class OAuthCancelledError extends Error {}

export async function loginWithGitHub(): Promise<{ token: string }> {
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    `https://github.com/login/oauth/authorize?` +
    `client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=repo`;

  let resultUrl: string | undefined;
  try {
    resultUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });
  } catch {
    throw new OAuthCancelledError("GitHub login was cancelled");
  }

  if (!resultUrl) {
    throw new OAuthCancelledError("GitHub login was cancelled");
  }

  const code = new URL(resultUrl).searchParams.get("code");
  if (!code) {
    throw new Error("GitHub didn't return a login code");
  }

  const res = await fetch(WORKER_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`);
  }

  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!body.access_token) {
    throw new Error(body.error ?? "Token exchange returned no access token");
  }

  return { token: body.access_token };
}
