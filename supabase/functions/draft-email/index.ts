// Drafts an email to a company (optionally a specific person there) with
// Claude: POST {companyId, contactId?, instructions?} -> {subject, body, attachments}.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DraftError, generateDraft } from "../_shared/drafting.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anthropic = new Anthropic();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: userData } = token ? await db.auth.getUser(token) : { data: { user: null } };
  const user = userData.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "ANTHROPIC_API_KEY is not configured." }, 500);

  const { companyId, contactId, instructions } = await req.json().catch(() => ({}));
  try {
    return json(await generateDraft(db, anthropic, { userId: user.id, companyId, contactId, instructions }));
  } catch (error) {
    if (error instanceof DraftError) return json({ error: error.message }, error.status);
    if (error instanceof Anthropic.RateLimitError) return json({ error: "Claude is busy right now. Try again in a minute." }, 429);
    if (error instanceof Anthropic.AuthenticationError) return json({ error: "The Anthropic API key is invalid." }, 500);
    if (error instanceof Anthropic.APIError) return json({ error: `Claude API error ${error.status}: ${error.message}` }, 502);
    console.error("draft failed", error);
    return json({ error: "Drafting failed." }, 500);
  }
});
