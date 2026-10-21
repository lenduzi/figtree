// Runs AI research jobs. Every 2 minutes (pg_cron, x-cron-secret) it queues
// weekly prospect searches that are due and works through the job queue for
// ~2 minutes. A signed-in user can also run one enrichment right away:
// POST {action: "enrich_now", companyId}.
// Each user has a monthly research budget (user_settings.research_budget_eur);
// once it's spent, their jobs wait in the queue until next month.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { enrichCompany, runProspectSearch, usageCostEur } from "../_shared/research.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

/** Stop picking up new jobs after this long, so a run finishes within the function's time limit. */
const RUN_BUDGET_MS = 100_000;
const STALE_RUNNING_MS = 10 * 60 * 1000;
const PROSPECT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const errorMessage = (error: unknown) =>
  error instanceof Anthropic.APIError ? `Claude API error ${error.status}: ${error.message}` : error instanceof Error ? error.message : String(error);

/** Euros left in the user's research budget this month. */
const budgetLeft = async (db: SupabaseClient, userId: string) => {
  const [{ data: settings }, { data: spent }] = await Promise.all([
    db.from("user_settings").select("research_budget_eur").eq("user_id", userId).maybeSingle(),
    db.rpc("research_spend_this_month", { target_user: userId }),
  ]);
  return Number(settings?.research_budget_eur ?? 20) - Number(spent ?? 0);
};

type Job = { id: string; user_id: string; kind: "enrich" | "prospect"; company_id: string | null; search_id: string | null };

const runJob = async (db: SupabaseClient, anthropic: Anthropic, job: Job) => {
  try {
    const result = job.kind === "enrich"
      ? await enrichCompany(db, anthropic, job.user_id, job.company_id!)
      : await runProspectSearch(db, anthropic, job.user_id, job.search_id!);
    await db.from("research_jobs").update({
      status: "done",
      result,
      cost_eur: Number(usageCostEur(result.usage).toFixed(4)),
      finished_at: new Date().toISOString(),
    }).eq("id", job.id);
    return { ok: true as const, result };
  } catch (error) {
    console.error("research job failed", job.id, error);
    await db.from("research_jobs")
      .update({ status: "failed", error: errorMessage(error), finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return { ok: false as const, error: errorMessage(error) };
  }
};

const runQueue = async (db: SupabaseClient, anthropic: Anthropic) => {
  const started = Date.now();
  const totals = { prospectRunsQueued: 0, jobsDone: 0, jobsFailed: 0 };

  // Jobs stuck in "running" (e.g. a crashed run) are given up on.
  await db.from("research_jobs")
    .update({ status: "failed", error: "Timed out", finished_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("started_at", new Date(started - STALE_RUNNING_MS).toISOString());

  const budgets = new Map<string, number>();
  const hasBudget = async (userId: string) => {
    if (!budgets.has(userId)) budgets.set(userId, await budgetLeft(db, userId));
    return (budgets.get(userId) ?? 0) > 0;
  };

  // Weekly prospect searches that are due.
  const { data: searches } = await db
    .from("prospect_searches")
    .select("id, user_id, last_run_at")
    .eq("active", true);
  for (const search of searches ?? []) {
    if (search.last_run_at && Date.parse(search.last_run_at) > started - PROSPECT_INTERVAL_MS) continue;
    if (!(await hasBudget(search.user_id))) continue;
    const { count } = await db.from("research_jobs").select("id", { count: "exact", head: true })
      .eq("search_id", search.id).in("status", ["queued", "running"]);
    if (count) continue;
    await db.from("research_jobs").insert({ user_id: search.user_id, kind: "prospect", search_id: search.id });
    // Marked now so it isn't queued again while it waits.
    await db.from("prospect_searches").update({ last_run_at: new Date().toISOString() }).eq("id", search.id);
    totals.prospectRunsQueued += 1;
  }

  while (Date.now() - started < RUN_BUDGET_MS) {
    // The oldest queued job of a user who still has budget this month.
    const { data: queued } = await db.from("research_jobs").select("id, user_id").eq("status", "queued")
      .order("created_at").limit(25);
    let next: { id: string; user_id: string } | null = null;
    for (const candidate of queued ?? []) {
      if (await hasBudget(candidate.user_id)) {
        next = candidate;
        break;
      }
    }
    if (!next) break;
    // Claim it, so an overlapping run can't take the same job.
    const { data: job } = await db.from("research_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", next.id).eq("status", "queued")
      .select("id, user_id, kind, company_id, search_id").maybeSingle();
    if (!job) continue;
    const outcome = await runJob(db, anthropic, job as Job);
    if (outcome.ok) totals.jobsDone += 1;
    else totals.jobsFailed += 1;
    budgets.delete(job.user_id); // re-read after spending
  }
  return totals;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "ANTHROPIC_API_KEY is not configured." }, 500);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anthropic = new Anthropic();

  if (CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) {
    return json(await runQueue(db, anthropic));
  }

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: userData } = token ? await db.auth.getUser(token) : { data: { user: null } };
  const user = userData.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  if (body?.action !== "enrich_now" || !body.companyId) return json({ error: "unsupported request" }, 400);

  const left = await budgetLeft(db, user.id);
  if (left <= 0) {
    return json({ error: "This month's research budget is used up. Raise it in Settings or wait until next month." }, 402);
  }

  // Recorded as a job too, so history and the queue's de-duplication see it.
  await db.from("research_jobs").delete().eq("company_id", body.companyId).eq("kind", "enrich").eq("status", "queued");
  const { data: job, error } = await db.from("research_jobs")
    .insert({ user_id: user.id, kind: "enrich", company_id: body.companyId, status: "running", started_at: new Date().toISOString() })
    .select("id, user_id, kind, company_id, search_id").single();
  if (error) return json({ error: "This company is already being researched." }, 409);
  const outcome = await runJob(db, anthropic, job as Job);
  return outcome.ok ? json(outcome.result) : json({ error: outcome.error }, 502);
});
