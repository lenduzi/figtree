// AI research with Claude + web search/fetch: enrich a company (contact
// details, public decision-makers, fit, a research brief) and prospect for new
// companies matching a search. Used by the research-worker function.

import Anthropic from "npm:@anthropic-ai/sdk";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { renderBrain, section, type BrainEntry, type BrainFile } from "./drafting.ts";

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 8;

type Usage = { input_tokens: number; output_tokens: number; web_searches: number; web_fetches: number };

type ResearchTool = Anthropic.Beta.BetaTool;

/**
 * Runs Claude with web search/fetch until it calls `tool` with its findings.
 * Handles pause_turn (long server-side tool loops) and one nudge if it stops
 * without saving.
 */
const runResearch = async (
  anthropic: Anthropic,
  { system, prompt, tool, maxSearches, maxFetches }: {
    system: string;
    prompt: string;
    tool: ResearchTool;
    maxSearches: number;
    maxFetches: number;
  },
) => {
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: maxSearches,
      user_location: { type: "approximate", country: "DE", timezone: "Europe/Berlin" },
    },
    // Pages are capped: long sites otherwise dominate the cost.
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: maxFetches, max_content_tokens: 6000 },
    { ...tool, strict: true },
  ];
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content: prompt }];
  const usage: Usage = { input_tokens: 0, output_tokens: 0, web_searches: 0, web_fetches: 0 };
  let nudged = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      tools,
      output_config: { effort: "medium" },
      // Caches the growing conversation across pause_turn continuations.
      cache_control: { type: "ephemeral" },
      messages,
    });
    usage.input_tokens += response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0);
    usage.output_tokens += response.usage.output_tokens;
    usage.web_searches += response.usage.server_tool_use?.web_search_requests ?? 0;
    usage.web_fetches += response.usage.server_tool_use?.web_fetch_requests ?? 0;

    const call = response.content.find((block) => block.type === "tool_use" && block.name === tool.name);
    if (call && call.type === "tool_use") return { input: call.input as Record<string, unknown>, usage };
    if (response.stop_reason === "refusal") throw new Error("Claude declined this research request.");
    if (response.stop_reason === "max_tokens") throw new Error("The research ran out of room. Try again.");

    // Keep the assistant turn as-is (server tool results and thinking included).
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "pause_turn") continue;
    if (nudged) break;
    nudged = true;
    messages.push({
      role: "user",
      content: `Save your findings now by calling ${tool.name}. Use empty strings for anything you couldn't verify.`,
    });
  }
  throw new Error("The research finished without results.");
};

const loadBrain = async (db: SupabaseClient, userId: string) => {
  const [entries, files, settings] = await Promise.all([
    db.from("brain_entries").select("section, title, content").eq("user_id", userId).order("section").order("sort_order"),
    db.from("brain_files").select("id, path, filename, mime_type, size, description").eq("user_id", userId),
    db.from("user_settings").select("ai_context").eq("user_id", userId).maybeSingle(),
  ]);
  // Voice rules and the file list don't matter for research.
  const relevant = ((entries.data ?? []) as BrainEntry[]).filter((entry) => entry.section !== "voice");
  return renderBrain(relevant, [] as BrainFile[], settings.data?.ai_context ?? "")
    .replace(/<file_library>[\s\S]*<\/file_library>/, "");
};

const RESEARCH_RULES = `Rules:
- Only use information the business itself publishes or official listings show: its website (including the Impressum/imprint), its Google Business listing, and its official social profiles. Prefer the business's own pages over directories.
- Contact details: record the business's own phone number and general email (e.g. info@...). Never guess or construct email addresses.
- People: only business roles that are publicly listed (e.g. Inhaber/Geschäftsführer in the Impressum, or a named marketing/events contact on the website). Include their email only if it is published.
- If something can't be verified, leave it empty rather than guessing.
- Search efficiently: start with the business name and city; open the website and the Impressum.`;

const FIT_RULES = `Fit against the company brain's target customers and offer:
- A: clear fit and promising (an experience people film and share, local customers, active or promising on social media, the right size).
- B: fits, with a caveat (e.g. small, little social presence, unclear decision-maker).
- C: weak or no fit.
The fit reason is one or two concrete sentences.`;

// ---------------------------------------------------------------------------
// Enrichment

const ENRICH_TOOL: ResearchTool = {
  name: "save_research",
  description: "Save what you found about the company. Call exactly once, at the end.",
  input_schema: {
    type: "object",
    properties: {
      is_operating: { type: "boolean", description: "False if the business seems closed or can't be found." },
      website: { type: "string" },
      phone: { type: "string", description: "Main business phone, international format if possible." },
      email: { type: "string", description: "General business email as published, e.g. info@..." },
      instagram: { type: "string", description: "Instagram handle with @, if they have an official account." },
      address: { type: "string" },
      city: { type: "string" },
      industry: { type: "string", description: "Short, e.g. 'Paint & Sip', 'Escape Room', 'Restaurant'." },
      type: { type: "string", enum: ["venue", "brand", "chain", "partner", "other"], description: "venue = single local location; chain = several locations; brand = consumer brand/product company." },
      people: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string" },
            email: { type: "string", description: "Only if published; else empty." },
          },
          required: ["name", "role", "email"],
          additionalProperties: false,
        },
      },
      fit: { type: "string", enum: ["A", "B", "C"] },
      fit_reason: { type: "string" },
      research_brief: {
        type: "string",
        description:
          "3-6 short lines: what they offer, who their customers are, their social media presence (platforms, rough follower counts, how active), anything notable (events, new location, press), and the best angle for a first message.",
      },
    },
    required: [
      "is_operating", "website", "phone", "email", "instagram", "address", "city", "industry", "type",
      "people", "fit", "fit_reason", "research_brief",
    ],
    additionalProperties: false,
  },
};

type EnrichResult = {
  is_operating: boolean;
  website: string;
  phone: string;
  email: string;
  instagram: string;
  address: string;
  city: string;
  industry: string;
  type: string;
  people: { name: string; role: string; email: string }[];
  fit: "A" | "B" | "C";
  fit_reason: string;
  research_brief: string;
};

export const enrichCompany = async (db: SupabaseClient, anthropic: Anthropic, userId: string, companyId: string) => {
  const { data: company } = await db
    .from("companies")
    .select("id, name, type, industry, city, address, website, phone, email, instagram, google_maps_url, notes")
    .eq("id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!company) throw new Error("Company not found");
  const { data: people } = await db.from("contacts").select("full_name, role, email").eq("company_id", companyId);

  const brain = await loadBrain(db, userId);
  const known = [
    `Name: ${company.name}`,
    company.city && `City: ${company.city}`,
    company.address && `Address: ${company.address}`,
    company.website && `Website: ${company.website}`,
    company.phone && `Phone: ${company.phone}`,
    company.instagram && `Instagram: ${company.instagram}`,
    company.google_maps_url && `Google Maps: ${company.google_maps_url}`,
    company.industry && `Industry: ${company.industry}`,
    (people ?? []).length && `People already known: ${(people ?? []).map((p) => `${p.full_name}${p.role ? ` (${p.role})` : ""}`).join(", ")}`,
  ].filter(Boolean).join("\n");

  const { input, usage } = await runResearch(anthropic, {
    system: `You research businesses for a B2B sales CRM, so the user knows who they are and whether they fit before reaching out.\n\n${RESEARCH_RULES}\n\n${FIT_RULES}\n\n${brain}`,
    prompt: `Research this company and save your findings.\n\n${section("known_so_far", known)}${
      company.notes ? `\n\n${section("user_notes", company.notes.slice(0, 2000))}` : ""
    }`,
    tool: ENRICH_TOOL,
    maxSearches: 4,
    maxFetches: 3,
  });
  const result = input as EnrichResult;

  // Fill gaps; never overwrite what the user already entered.
  const keep = (current: string | null, found: string) => (current && current.trim() ? current : found.trim());
  const updates: Record<string, unknown> = {
    website: keep(company.website, result.website),
    phone: keep(company.phone, result.phone),
    email: keep(company.email, result.email),
    instagram: keep(company.instagram, normalizeInstagram(result.instagram)),
    address: keep(company.address, result.address),
    city: keep(company.city, result.city),
    industry: keep(company.industry, result.industry),
    fit: result.fit,
    fit_reason: result.fit_reason.trim(),
    research: [result.is_operating ? "" : "⚠️ Looks closed or couldn't be found.", result.research_brief.trim()]
      .filter(Boolean).join("\n"),
    enriched_at: new Date().toISOString(),
  };
  if (company.type === "other") updates.type = result.type;
  await db.from("companies").update(updates).eq("id", companyId);

  // Add publicly listed people we don't have yet.
  const knownNames = new Set((people ?? []).map((person) => person.full_name.trim().toLowerCase()));
  const newPeople = result.people.filter((person) => person.name.trim() && !knownNames.has(person.name.trim().toLowerCase()));
  if (newPeople.length) {
    const { data: stage } = await db.from("stages").select("id").eq("user_id", userId).order("sort_order").limit(1).maybeSingle();
    const now = new Date().toISOString();
    await db.from("contacts").insert(newPeople.slice(0, 5).map((person) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      company_id: companyId,
      full_name: person.name.trim(),
      role: person.role.trim(),
      email: person.email.trim(),
      company: company.name,
      stage_id: stage?.id ?? "lead",
      notes: "Found by AI research",
      created_at: now,
      updated_at: now,
    })));
  }

  await db.from("activities").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    company_id: companyId,
    type: "note",
    description: `AI research: fit ${result.fit} — ${result.fit_reason.trim()}`,
    occurred_at: new Date().toISOString(),
  });

  return { fit: result.fit, fit_reason: result.fit_reason, people_added: newPeople.length, is_operating: result.is_operating, usage };
};

// ---------------------------------------------------------------------------
// Prospecting

const PROSPECT_TOOL: ResearchTool = {
  name: "save_prospects",
  description: "Save the businesses you found. Call exactly once, at the end.",
  input_schema: {
    type: "object",
    properties: {
      prospects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            website: { type: "string" },
            city: { type: "string" },
            address: { type: "string" },
            phone: { type: "string" },
            instagram: { type: "string" },
            why: { type: "string", description: "One sentence on why this business fits." },
          },
          required: ["name", "website", "city", "address", "phone", "instagram", "why"],
          additionalProperties: false,
        },
      },
    },
    required: ["prospects"],
    additionalProperties: false,
  },
};

/** "https://instagram.com/foo/" or "foo" -> "@foo" */
const normalizeInstagram = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const handle = trimmed.match(/instagram\.com\/([^/?#]+)/i)?.[1] ?? trimmed.replace(/^@/, "");
  return handle ? `@${handle}` : "";
};

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
const hostOf = (value: string) => {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).host.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const digits = (value: string) => value.replace(/\D/g, "");

export const runProspectSearch = async (db: SupabaseClient, anthropic: Anthropic, userId: string, searchId: string) => {
  const { data: search } = await db
    .from("prospect_searches")
    .select("id, name, query, location, company_type, weekly_target")
    .eq("id", searchId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!search) throw new Error("Search not found");

  const [{ data: existing }, { data: rejected }] = await Promise.all([
    db.from("companies").select("name, website, phone, city").eq("user_id", userId),
    db.from("companies").select("name, lost_reason").eq("user_id", userId).eq("source", "ai_prospecting")
      .eq("lifecycle", "disqualified").neq("lost_reason", "").order("updated_at", { ascending: false }).limit(20),
  ]);
  const known = existing ?? [];
  const location = search.location.trim().toLowerCase();
  const nearby = known
    .filter((company) => !location || (company.city ?? "").toLowerCase().includes(location))
    .map((company) => company.name)
    .slice(0, 300);

  const brain = await loadBrain(db, userId);
  const target = Math.max(1, Math.min(search.weekly_target, 25));
  const { input, usage } = await runResearch(anthropic, {
    system: `You find new prospects for a B2B sales CRM: real, currently operating businesses that fit the user's target customers.\n\n${RESEARCH_RULES}\n\n${brain}`,
    prompt: [
      `Find up to ${target} businesses: ${search.query}${search.location ? ` in ${search.location}` : ""}.`,
      "Only include businesses that fit the target customers in the company brain, and prefer the most promising ones (active on social media, experiences people like to film).",
      section("already_in_crm_skip_these", nearby.join("\n")),
      section("rejected_before_avoid_similar", (rejected ?? []).map((company) => `${company.name}: ${company.lost_reason}`).join("\n")),
      "Then save them.",
    ].filter(Boolean).join("\n\n"),
    tool: PROSPECT_TOOL,
    maxSearches: 6,
    maxFetches: 2,
  });

  // Drop anything we already have (by name, website or phone).
  const knownNames = new Set(known.map((company) => normalizeName(company.name)));
  const knownHosts = new Set(known.map((company) => hostOf(company.website ?? "")).filter(Boolean));
  const knownPhones = new Set(known.map((company) => digits(company.phone ?? "")).filter((phone) => phone.length >= 6));
  const prospects = ((input.prospects ?? []) as { name: string; website: string; city: string; address: string; phone: string; instagram: string; why: string }[])
    .filter((prospect) => {
      const name = normalizeName(prospect.name);
      const host = hostOf(prospect.website);
      const phone = digits(prospect.phone);
      if (!name || knownNames.has(name) || (host && knownHosts.has(host)) || (phone.length >= 6 && knownPhones.has(phone))) {
        return false;
      }
      knownNames.add(name);
      if (host) knownHosts.add(host);
      return true;
    })
    .slice(0, target);

  const now = new Date().toISOString();
  const rows = prospects.map((prospect) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    name: prospect.name.trim(),
    type: search.company_type,
    website: prospect.website.trim(),
    city: prospect.city.trim() || search.location,
    address: prospect.address.trim(),
    phone: prospect.phone.trim(),
    instagram: normalizeInstagram(prospect.instagram),
    lifecycle: "sourced",
    source: "ai_prospecting",
    lists: [search.name],
    notes: prospect.why.trim(),
    needs_review: true,
    created_at: now,
  }));
  if (rows.length) {
    await db.from("companies").insert(rows);
    // Each new prospect gets researched and rated before it shows up for review.
    await db.from("research_jobs").insert(rows.map((row) => ({ user_id: userId, kind: "enrich", company_id: row.id })));
  }
  await db.from("prospect_searches").update({ last_run_at: now }).eq("id", searchId);
  return { found: rows.length, usage };
};
