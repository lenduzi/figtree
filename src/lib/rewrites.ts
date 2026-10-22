import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type RewritePreset = {
  /** Counts usage; built-ins have fixed keys, your own are "custom:<instruction>". */
  key: string;
  label: string;
  instruction: string;
  /** Added to the brain's voice rules when you make this the default for first drafts. */
  rule?: string;
  custom?: boolean;
};

export const BUILT_IN_REWRITES: RewritePreset[] = [
  {
    key: "shorter",
    label: "Shorter",
    instruction: "Make it noticeably shorter. Cut filler, repetition and hedging; keep the key point and the ask.",
    rule: "Keep emails short: cut filler and hedging, one key point and a clear ask, ideally under 100 words.",
  },
  {
    key: "warmer",
    label: "Warmer",
    instruction: "Make it warmer and more personal, like a friendly note between people. No gushing, no flattery.",
    rule: "Write warmly and personally, like a friendly note between people, without flattery.",
  },
  {
    key: "formal",
    label: "More formal",
    instruction: "Make it more formal and polished, while keeping it brief and human.",
    rule: "Keep a more formal, polished tone, while staying brief and human.",
  },
  {
    key: "casual",
    label: "More casual",
    instruction: "Make it more casual and relaxed, as if writing to someone you've met before.",
    rule: "Keep a casual, relaxed tone.",
  },
  {
    key: "simpler",
    label: "Simpler",
    instruction: "Use simpler words and shorter sentences. Remove jargon and buzzwords.",
    rule: "Use simple words and short sentences; no jargon or buzzwords.",
  },
  {
    key: "less_salesy",
    label: "Less salesy",
    instruction: "Make it less salesy: no pitch language or hype, more curious and helpful.",
    rule: "Avoid pitch language and hype; be curious and helpful rather than salesy.",
  },
  {
    key: "clearer_ask",
    label: "Clearer ask",
    instruction: "Make the next step clearer and easier to say yes to: one concrete, low-effort ask.",
    rule: "End with one concrete, low-effort ask that's easy to say yes to.",
  },
  {
    key: "du_sie",
    label: "Du ↔ Sie",
    instruction: "Switch the form of address: if the email uses 'du', rewrite it with 'Sie'; if it uses 'Sie', rewrite it with 'du'. Adjust the greeting and closing to match. If it isn't in German, make it more formal or more casual accordingly.",
  },
  {
    key: "translate",
    label: "English ↔ Deutsch",
    instruction: "Translate it: German into natural English, anything else into natural German. Translate the subject too. Keep the tone; for German, keep 'du' or 'Sie' consistent with the original's formality.",
  },
];

const getClient = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};

export const customPresetKey = (instruction: string) => `custom:${instruction.trim().toLowerCase()}`;

export const rewriteEmail = async (email: { subject: string; body: string; instruction: string; key?: string }) => {
  const { data, error } = await getClient().functions.invoke("draft-email", { body: { rewrite: email } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      throw new Error(details?.error ?? error.message);
    }
    throw error;
  }
  return data as { subject: string; body: string; suggestDefault: boolean };
};

/** Your own saved rewrite buttons. */
export const getCustomRewrites = async (): Promise<RewritePreset[]> => {
  const { data, error } = await getClient().from("user_settings").select("rewrite_presets").maybeSingle();
  if (error) throw error;
  const saved = (data?.rewrite_presets ?? []) as { label: string; instruction: string }[];
  return saved.map((preset) => ({
    key: customPresetKey(preset.instruction),
    label: preset.label,
    instruction: preset.instruction,
    rule: preset.instruction,
    custom: true,
  }));
};

export const saveCustomRewrites = async (presets: RewritePreset[]) => {
  const client = getClient();
  const { data } = await client.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Not signed in");
  const { error } = await client.from("user_settings").upsert({
    user_id: userId,
    rewrite_presets: presets.map(({ label, instruction }) => ({ label, instruction })),
  });
  if (error) throw error;
};

/** A short button label for a free-text instruction. */
export const labelFor = (instruction: string) => {
  const text = instruction.trim().replace(/[.!]+$/, "");
  const short = text.length > 28 ? `${text.slice(0, 26).trimEnd()}…` : text;
  return short.charAt(0).toUpperCase() + short.slice(1);
};

const LEARNED_TITLE = "Learned from your rewrites";

/** Answers the "make this the default?" offer; yes adds the rule to the brain's voice rules. */
export const answerRewriteDefault = async (preset: RewritePreset, accept: boolean) => {
  const client = getClient();
  const { data: session } = await client.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error("Not signed in");

  if (accept && preset.rule) {
    const { data: existing, error } = await client
      .from("brain_entries")
      .select("id, content")
      .eq("section", "voice")
      .eq("title", LEARNED_TITLE)
      .maybeSingle();
    if (error) throw error;
    const line = `- ${preset.rule}`;
    if (existing) {
      if (!existing.content.includes(line)) {
        const { error: updateError } = await client
          .from("brain_entries")
          .update({ content: `${existing.content.trim()}\n${line}` })
          .eq("id", existing.id);
        if (updateError) throw updateError;
      }
    } else {
      const { error: insertError } = await client
        .from("brain_entries")
        .insert({ section: "voice", title: LEARNED_TITLE, content: line, sort_order: 999 });
      if (insertError) throw insertError;
    }
  }

  const { data } = await client.from("user_settings").select("rewrite_stats").maybeSingle();
  const stats = (data?.rewrite_stats ?? {}) as Record<string, { count: number; offered?: boolean }>;
  await client.from("user_settings").upsert({
    user_id: userId,
    rewrite_stats: { ...stats, [preset.key]: { count: stats[preset.key]?.count ?? 0, offered: true } },
  });
};
