// Connects and disconnects a user's Gmail account.
//
//   POST {action: "start", redirectTo}  (signed in)  -> {url} of Google's consent screen
//   GET  ?code=...&state=...            (Google)     -> stores tokens, redirects back to the app
//   POST {action: "disconnect"}         (signed in)  -> revokes and deletes the tokens

import { createClient } from "npm:@supabase/supabase-js@2";
import { GMAIL_SCOPES, GMAIL_SIGNATURE_SCOPE, googleClientId, googleClientSecret } from "../_shared/gmail.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-oauth`;
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

// Only send people back to the app itself (no open redirect).
const ALLOWED_RETURN_ORIGINS = [
  "https://www.figtreecrm.com",
  "https://figtreecrm.com",
  "http://localhost:8080",
  "http://localhost:8091",
  "http://localhost:5173",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const returnUrl = (redirectTo: string, params: Record<string, string>) => {
  const url = new URL(redirectTo);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
};

const handleCallback = async (url: URL) => {
  const state = url.searchParams.get("state") ?? "";
  const { data: pending } = await db
    .from("gmail_oauth_states")
    .select("user_id, redirect_to, created_at")
    .eq("state", state)
    .maybeSingle();
  if (!pending) return new Response("This sign-in link has expired. Start again from Figtree's Settings.", { status: 400 });
  await db.from("gmail_oauth_states").delete().eq("state", state);

  const back = (params: Record<string, string>) =>
    Response.redirect(returnUrl(pending.redirect_to, params), 302);

  if (Date.now() - Date.parse(pending.created_at) > STATE_MAX_AGE_MS) return back({ gmail: "error", reason: "expired" });
  const googleError = url.searchParams.get("error");
  if (googleError) return back({ gmail: "error", reason: googleError });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") ?? "",
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.refresh_token) {
    console.error("token exchange failed", tokens?.error, tokens?.error_description);
    return back({ gmail: "error", reason: tokens?.error ?? "no_refresh_token" });
  }

  const granted = String(tokens.scope ?? "").split(" ");
  if (!GMAIL_SCOPES.every((scope) => granted.includes(scope))) {
    return back({ gmail: "error", reason: "missing_permissions" });
  }

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileResponse.json();
  if (!profileResponse.ok) return back({ gmail: "error", reason: "profile_failed" });

  const now = new Date();
  await db.from("gmail_tokens").upsert({
    user_id: pending.user_id,
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    access_token_expires_at: new Date(now.getTime() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope ?? "",
    updated_at: now.toISOString(),
  });
  await db.from("gmail_accounts").upsert({
    user_id: pending.user_id,
    email: profile.emailAddress,
    connected_at: now.toISOString(),
  });
  return back({ gmail: "connected" });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  if (req.method === "GET") return handleCallback(url);
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: userData } = token ? await db.auth.getUser(token) : { data: { user: null } };
  const user = userData.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));

  if (body?.action === "start") {
    if (!googleClientId() || !googleClientSecret()) {
      return json({ error: "Google client ID/secret are not configured on the server." }, 500);
    }
    let redirectTo: URL;
    try {
      redirectTo = new URL(String(body.redirectTo ?? ""));
    } catch {
      return json({ error: "invalid redirectTo" }, 400);
    }
    if (!ALLOWED_RETURN_ORIGINS.includes(redirectTo.origin)) return json({ error: "redirect not allowed" }, 400);

    const state = crypto.randomUUID() + crypto.randomUUID();
    await db.from("gmail_oauth_states").delete().lt("created_at", new Date(Date.now() - STATE_MAX_AGE_MS).toISOString());
    const { error } = await db
      .from("gmail_oauth_states")
      .insert({ state, user_id: user.id, redirect_to: redirectTo.toString() });
    if (error) return json({ error: error.message }, 500);

    const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    consent.search = new URLSearchParams({
      client_id: googleClientId(),
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      // The signature scope is optional; the callback only requires GMAIL_SCOPES.
      scope: [...GMAIL_SCOPES, GMAIL_SIGNATURE_SCOPE].join(" "),
      access_type: "offline",
      // Always ask, so Google returns a refresh token even on reconnect.
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      ...(user.email ? { login_hint: user.email } : {}),
    }).toString();
    return json({ url: consent.toString() });
  }

  if (body?.action === "disconnect") {
    const { data: tokens } = await db.from("gmail_tokens").select("refresh_token").eq("user_id", user.id).maybeSingle();
    if (tokens?.refresh_token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refresh_token)}`, {
        method: "POST",
      }).catch(() => undefined);
    }
    await db.from("gmail_tokens").delete().eq("user_id", user.id);
    await db.from("gmail_accounts").delete().eq("user_id", user.id);
    return json({ disconnected: true });
  }

  return json({ error: "unsupported action" }, 400);
});
