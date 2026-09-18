// Paste this into a new Deno Deploy "Playground" project's code editor and
// click Deploy. It does exactly one job: trade a temporary GitHub login code
// for a real access token, using a secret this script never exposes to
// anyone but GitHub itself.
//
// Before deploying, set an environment variable in the Deno Deploy project's
// dashboard (Settings -> Environment Variables):
//   GITHUB_CLIENT_SECRET = <the client secret from your GitHub OAuth App>
//
// Replace the two placeholders below with your own values once you have
// them (the extension ID is visible on the CodeLedger card at
// chrome://extensions; the client ID comes from your GitHub OAuth App page
// and is safe to hardcode here — only the secret is sensitive).
const EXTENSION_ID = "ppkdfibnadlafpilkffihlmnedmlleja";
const GITHUB_CLIENT_ID = "Ov23li9KCLHZRJDYkhZc";

const corsHeaders = {
  "Access-Control-Allow-Origin": `chrome-extension://${EXTENSION_ID}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const { code, redirect_uri } = await req.json();
  if (!code || !redirect_uri) {
    return new Response(JSON.stringify({ error: "Missing code or redirect_uri" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      client_secret: Deno.env.get("GITHUB_CLIENT_SECRET") ?? "",
      code,
      redirect_uri,
    }).toString(),
  });

  const tokenBody = await tokenRes.json();

  return new Response(
    JSON.stringify(
      tokenBody.access_token
        ? { access_token: tokenBody.access_token }
        : { error: tokenBody.error_description ?? "No access token returned" }
    ),
    { headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
});
