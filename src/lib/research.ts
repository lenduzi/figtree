import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { CompanyType } from "@/types/crm";

export type SearchStrategy = "lookalike" | "intent";

export type ProspectSearch = {
  id: string;
  name: string;
  query: string;
  location: string;
  company_type: CompanyType | "any";
  strategy: SearchStrategy;
  weekly_target: number;
  active: boolean;
  last_run_at: string | null;
  created_at: string;
};

export type ResearchJob = {
  id: string;
  kind: "enrich" | "prospect";
  company_id: string | null;
  search_id: string | null;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  result: { found?: number; fit?: string } | null;
  created_at: string;
  finished_at: string | null;
};

/** Rough average cost per job on Claude Sonnet 5.5 with web search, for the UI. */
export const ESTIMATED_COST_EUR = { enrich: 0.15, prospectRun: 0.35 };

/** What research cost this calendar month, and the monthly cap. */
export const getResearchBudget = async () => {
  const client = getClient();
  const { data: session } = await client.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error("Not signed in");
  const [{ data: spent, error }, { data: settings }] = await Promise.all([
    client.rpc("research_spend_this_month", { target_user: userId }),
    client.from("user_settings").select("research_budget_eur").maybeSingle(),
  ]);
  if (error) throw error;
  return { spent: Number(spent ?? 0), budget: Number(settings?.research_budget_eur ?? 20) };
};

const getClient = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};

/** Researches one company right away (takes about a minute). */
export const enrichNow = async (companyId: string) => {
  const { data, error } = await getClient().functions.invoke("research-worker", {
    body: { action: "enrich_now", companyId },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      throw new Error(details?.error ?? error.message);
    }
    throw error;
  }
  return data as { fit: string; fit_reason: string; people_added: number; is_operating: boolean };
};

const openJobsFor = async (companyIds: string[]) => {
  const { data, error } = await getClient()
    .from("research_jobs")
    .select("company_id")
    .eq("kind", "enrich")
    .in("status", ["queued", "running"])
    .in("company_id", companyIds);
  if (error) throw error;
  return new Set((data ?? []).map((job) => job.company_id as string));
};

/** Queues companies for background research; ones already queued are skipped. */
export const queueEnrichment = async (companyIds: string[]) => {
  if (companyIds.length === 0) return 0;
  const open = await openJobsFor(companyIds);
  const rows = companyIds.filter((id) => !open.has(id)).map((id) => ({ kind: "enrich", company_id: id }));
  if (rows.length === 0) return 0;
  const { error } = await getClient().from("research_jobs").insert(rows);
  if (error) throw error;
  return rows.length;
};

export const countOpenJobs = async () => {
  const { count, error } = await getClient()
    .from("research_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"]);
  if (error) throw error;
  return count ?? 0;
};

export const listRecentJobs = async (limit = 20) => {
  const { data, error } = await getClient()
    .from("research_jobs")
    .select("id, kind, company_id, search_id, status, error, result, created_at, finished_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ResearchJob[];
};

export const listSearches = async () => {
  const { data, error } = await getClient()
    .from("prospect_searches")
    .select("id, name, query, location, company_type, strategy, weekly_target, active, last_run_at, created_at")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ProspectSearch[];
};

export const saveSearch = async (search: Partial<ProspectSearch> & { name: string }) => {
  const { id, ...fields } = search;
  const query = id
    ? getClient().from("prospect_searches").update(fields).eq("id", id)
    : getClient().from("prospect_searches").insert(fields);
  const { error } = await query;
  if (error) throw error;
};

export const deleteSearch = async (id: string) => {
  const { error } = await getClient().from("prospect_searches").delete().eq("id", id);
  if (error) throw error;
};

/** Runs a search now instead of waiting for its weekly turn. */
export const runSearchNow = async (searchId: string) => {
  const { count } = await getClient()
    .from("research_jobs")
    .select("id", { count: "exact", head: true })
    .eq("search_id", searchId)
    .in("status", ["queued", "running"]);
  if (count) return false;
  const { error } = await getClient().from("research_jobs").insert({ kind: "prospect", search_id: searchId });
  if (error) throw error;
  return true;
};
