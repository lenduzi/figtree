// Sends one of the signed-in user's emails right away: POST {emailId}.
// Scheduled emails are sent by send-reminders instead.

import { createClient } from "npm:@supabase/supabase-js@2";
import { deliverEmailRow } from "../_shared/gmail.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: userData } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!userData.user) return json({ error: "unauthorized" }, 401);

  const { emailId } = await req.json().catch(() => ({}));
  if (!emailId) return json({ error: "emailId is required" }, 400);

  // Claim it, so a concurrent cron run can't send it too.
  const { data: email, error } = await db
    .from("emails")
    .update({ status: "sending" })
    .eq("id", emailId)
    .eq("user_id", userData.user.id)
    .eq("status", "scheduled")
    .select("id, user_id, contact_id, to_email, subject, body, attachments")
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!email) return json({ error: "Email not found or already sent." }, 404);

  const result = await deliverEmailRow(db, email);
  return result.ok ? json({ sent: true }) : json({ error: result.error }, 502);
});
