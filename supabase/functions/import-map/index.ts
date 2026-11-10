// Maps the columns of an imported lead list to Figtree fields with Claude
// Sonnet: POST {headers: string[], samples: string[][]} -> {columns: [{index, target}]}.
// Only headers and a few sample rows are sent, so a call costs about a cent.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

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

const TARGETS = {
  "company.name": "Name of the company, brand, venue or organisation",
  "company.website": "Company website or domain",
  "company.email": "Generic company email (info@, hello@, office@)",
  "company.phone": "Company phone number",
  "company.city": "City or location of the company",
  "company.address": "Street address",
  "company.industry": "Industry, sector, category or niche",
  "company.instagram": "Instagram handle or URL",
  "company.linkedin": "Company LinkedIn page",
  "company.googleMapsUrl": "Google Maps link",
  "company.fitReason": "Why this company is a good lead: reasoning, signals, evidence, angle",
  "person.fullName": "Full name of a contact person at the company",
  "person.firstName": "First name of the contact person",
  "person.lastName": "Last name of the contact person",
  "person.role": "Job title or role of the contact person",
  "person.email": "Email address of the contact person",
  "person.phone": "Direct phone of the contact person",
  "person.linkedin": "LinkedIn profile of the contact person",
  "notes": "Anything else worth keeping (scores, sizes, status, sources, comments)",
  "ignore": "Empty, meaningless or purely technical columns (row numbers, IDs)",
};

const SCHEMA = {
  type: "object",
  properties: {
    columns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "Zero-based column index." },
          target: { type: "string", enum: Object.keys(TARGETS) },
        },
        required: ["index", "target"],
        additionalProperties: false,
      },
    },
  },
  required: ["columns"],
  additionalProperties: false,
};

const PROMPT = `You map the columns of a sales lead list (often made by an AI assistant, in English or German) to CRM fields.

Fields:
${Object.entries(TARGETS).map(([id, description]) => `- ${id}: ${description}`).join("\n")}

Rules:
- Return exactly one entry per column, in order.
- Judge by the sample values as much as by the header. An "Email" column holding personal addresses (anna.meier@…) next to a contact name is person.email; info@… is company.email.
- Each field except notes, ignore and company.fitReason may be used at most once; send extra candidates to notes.
- When unsure between a field and notes, choose notes. Never discard data that might matter; use ignore only for meaningless columns.`;

const clip = (value: unknown, max: number) => String(value ?? "").slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: userData } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!userData.user) return json({ error: "unauthorized" }, 401);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "ANTHROPIC_API_KEY is not configured." }, 500);

  const body = await req.json().catch(() => ({}));
  const headers: string[] = Array.isArray(body.headers) ? body.headers.slice(0, 80).map((h: unknown) => clip(h, 120)) : [];
  if (headers.length === 0) return json({ error: "No columns to map." }, 400);
  const samples: string[][] = Array.isArray(body.samples)
    ? body.samples.slice(0, 5).map((row: unknown) =>
      Array.isArray(row) ? headers.map((_, i) => clip(row[i], 160)) : headers.map(() => ""))
    : [];

  const table = headers.map((header, index) => {
    const values = samples.map((row) => row[index]).filter(Boolean);
    return `Column ${index}: "${header}"\n  samples: ${values.length ? values.map((v) => JSON.stringify(v)).join(" | ") : "(empty)"}`;
  }).join("\n");

  try {
    const response = await anthropic.beta.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 3000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: PROMPT,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `<columns>\n${table}\n</columns>` }],
    });
    if (response.stop_reason === "refusal") return json({ error: "Claude declined to map this file." }, 422);
    const text = response.content.find((block) => block.type === "text");
    const result = JSON.parse(text && "text" in text ? text.text : "{}");
    if (!Array.isArray(result.columns)) return json({ error: "Claude returned an unexpected format." }, 502);
    return json({ columns: result.columns });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: "Claude is busy right now. Try again in a minute." }, 429);
    if (error instanceof Anthropic.AuthenticationError) return json({ error: "The Anthropic API key is invalid." }, 500);
    if (error instanceof Anthropic.APIError) return json({ error: `Claude API error ${error.status}: ${error.message}` }, 502);
    console.error("import-map failed", error);
    return json({ error: "Column mapping failed." }, 500);
  }
});
