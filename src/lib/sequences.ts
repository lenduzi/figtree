import { supabase } from "@/lib/supabase";
import type { Lifecycle } from "@/types/crm";

export type SequenceChannel = "call" | "email";

export type SequenceStep = {
  /** Business days after the previous step was done (the first: after starting). */
  wait_days: number;
  channel: SequenceChannel;
  label: string;
  /** Talking points for calls; what Claude should write for emails. */
  instructions: string;
  /** Email steps: reply in the thread of the previous email in this sequence. */
  reply_in_thread?: boolean;
};

export type SequenceAudience = "venue" | "brand" | "any";

export type Sequence = {
  id: string;
  name: string;
  description: string;
  audience: SequenceAudience;
  steps: SequenceStep[];
  archived: boolean;
  created_at: string;
};

export type EnrollmentStatus = "active" | "waiting" | "paused" | "completed" | "stopped";

export type Enrollment = {
  id: string;
  sequence_id: string;
  company_id: string;
  contact_id: string | null;
  to_email: string;
  status: EnrollmentStatus;
  step_index: number;
  next_step_on: string | null;
  start_lifecycle: Lifecycle;
  stop_reason: string;
  pending_task_id: string | null;
  pending_email_id: string | null;
  started_at: string;
  finished_at: string | null;
};

export const RUNNING_STATUSES: EnrollmentStatus[] = ["active", "waiting", "paused"];

/** The starter plays, created the first time the Sequences page opens. */
export const DEFAULT_SEQUENCES: Omit<Sequence, "id" | "created_at" | "archived">[] = [
  {
    name: "Cold venue (call first)",
    description: "Local venues: call first, then short emails in one thread.",
    audience: "venue",
    steps: [
      {
        wait_days: 0,
        channel: "call",
        label: "Intro call",
        instructions:
          "Reach the owner or whoever runs marketing. Introduce Whisper in one sentence (guests post videos about their visit and get paid per view; the venue only pays for verified views). Goal: a 15-minute call or permission to send info.",
      },
      {
        wait_days: 1,
        channel: "email",
        label: "Intro email",
        instructions:
          "First email after trying to call. Mention you tried to reach them by phone. One sentence on what Whisper does for a venue like theirs, one fitting proof point from the brain, then ask for a 15-minute call (booking link).",
      },
      {
        wait_days: 3,
        channel: "call",
        label: "Follow-up call",
        instructions: "Ask whether they saw the email and whether a short call this week works.",
      },
      {
        wait_days: 3,
        channel: "email",
        label: "Bump",
        reply_in_thread: true,
        instructions:
          "Short bump (2-4 sentences). Add one new angle, e.g. how guests at similar venues post about their visit, or the cost cap per video. End with a yes/no question.",
      },
      {
        wait_days: 7,
        channel: "email",
        label: "Last email",
        reply_in_thread: true,
        instructions:
          "Polite last message: you won't keep writing, the door stays open, and they can reply with a single word if the timing is better later. No pressure.",
      },
    ],
  },
  {
    name: "Cold brand / chain (email first)",
    description: "Brands and chains with a marketing team: email first, one call in between.",
    audience: "brand",
    steps: [
      {
        wait_days: 0,
        channel: "email",
        label: "Intro email",
        instructions:
          "Intro to the marketing lead. Why their customers are a fit for ambassador videos, one proof point from the brain, and a request for a 15-minute call (booking link). Keep it short.",
      },
      {
        wait_days: 3,
        channel: "email",
        label: "Bump",
        reply_in_thread: true,
        instructions:
          "Short bump with a different angle: cost control (pay per verified view, fixed cap per video, no setup fee). Yes/no question at the end.",
      },
      {
        wait_days: 2,
        channel: "call",
        label: "Follow-up call",
        instructions: "If a number is known: call about the emails and offer a quick intro call.",
      },
      {
        wait_days: 5,
        channel: "email",
        label: "Proof email",
        reply_in_thread: true,
        instructions:
          "A concrete example or result from the brain, and what a small pilot would look like for them (budget, timeline, what they need to do).",
      },
      {
        wait_days: 7,
        channel: "email",
        label: "Last email",
        reply_in_thread: true,
        instructions: "Polite last message, door stays open, no pressure.",
      },
    ],
  },
  {
    name: "After a first call",
    description: "Right after a good first conversation.",
    audience: "any",
    steps: [
      {
        wait_days: 0,
        channel: "email",
        label: "Recap",
        instructions:
          "Recap of the call based on the latest notes and activity: what you discussed, the agreed next step, and offer the deck if it fits (attach it if it's in the file library).",
      },
      {
        wait_days: 3,
        channel: "email",
        label: "Check-in",
        reply_in_thread: true,
        instructions: "Short check-in on the recap; offer to answer questions or set up the pilot.",
      },
      {
        wait_days: 4,
        channel: "call",
        label: "Agree next step",
        instructions: "Call to agree on the pilot or the concrete next step.",
      },
    ],
  },
  {
    name: "Proposal chase",
    description: "After sending a proposal or pilot offer.",
    audience: "any",
    steps: [
      {
        wait_days: 2,
        channel: "email",
        label: "Check-in",
        instructions: "Friendly check whether they had a chance to look at the proposal; offer a quick call to go through it.",
      },
      {
        wait_days: 3,
        channel: "call",
        label: "Proposal call",
        instructions: "Call about the proposal: open questions, timing, who else needs to agree.",
      },
      {
        wait_days: 5,
        channel: "email",
        label: "Last nudge",
        reply_in_thread: true,
        instructions:
          "Last nudge with a simple yes/no question. Mention that there's no setup fee and it can be paused anytime, so trying it is low-risk.",
      },
    ],
  },
  {
    name: "Reactivation",
    description: "Deals that went quiet, or Not now companies whose revisit date came up.",
    audience: "any",
    steps: [
      {
        wait_days: 0,
        channel: "email",
        label: "Check-in",
        instructions:
          "Re-open the conversation: reference the last contact, share one new thing (a result, a new customer in their industry) and ask a low-pressure question.",
      },
      {
        wait_days: 5,
        channel: "call",
        label: "Follow-up call",
        instructions: "Follow up on the email and ask whether now is a better time.",
      },
    ],
  },
];

const getClient = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};

const SEQUENCE_COLUMNS = "id, name, description, audience, steps, archived, created_at";
const ENROLLMENT_COLUMNS =
  "id, sequence_id, company_id, contact_id, to_email, status, step_index, next_step_on, start_lifecycle, stop_reason, pending_task_id, pending_email_id, started_at, finished_at";

export const listSequences = async () => {
  const { data, error } = await getClient().from("sequences").select(SEQUENCE_COLUMNS).order("created_at");
  if (error) throw error;
  return (data ?? []) as Sequence[];
};

/** Lists sequences, creating the starter plays the first time. */
export const listSequencesWithDefaults = async () => {
  const existing = await listSequences();
  if (existing.length > 0) return existing;
  const { error } = await getClient().from("sequences").insert(DEFAULT_SEQUENCES);
  if (error) throw error;
  return listSequences();
};

export const createSequence = async (fields: Pick<Sequence, "name" | "description" | "audience" | "steps">) => {
  const { data, error } = await getClient().from("sequences").insert(fields).select(SEQUENCE_COLUMNS).single();
  if (error) throw error;
  return data as Sequence;
};

export const updateSequence = async (id: string, fields: Partial<Pick<Sequence, "name" | "description" | "audience" | "steps" | "archived">>) => {
  const { error } = await getClient().from("sequences").update(fields).eq("id", id);
  if (error) throw error;
};

export const listEnrollments = async (filter: { companyId?: string; running?: boolean } = {}) => {
  let query = getClient().from("sequence_enrollments").select(ENROLLMENT_COLUMNS).order("started_at", { ascending: false });
  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (filter.running) query = query.in("status", RUNNING_STATUSES);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Enrollment[];
};

/**
 * Starts a sequence for companies. Companies already running one are skipped
 * (one play at a time). Returns how many were started.
 */
export const enrollCompanies = async (
  sequence: Sequence,
  targets: { companyId: string; contactId: string | null; toEmail: string; lifecycle: Lifecycle }[],
  today: string,
) => {
  const running = await listEnrollments({ running: true });
  const busy = new Set(running.map((enrollment) => enrollment.company_id));
  const rows = targets
    .filter((target) => !busy.has(target.companyId))
    .map((target) => ({
      sequence_id: sequence.id,
      company_id: target.companyId,
      contact_id: target.contactId,
      to_email: target.toEmail,
      start_lifecycle: target.lifecycle,
      status: "active",
      step_index: 0,
      // The job runs the first step on its next pass (weekdays, from 07:00).
      next_step_on: today,
    }));
  if (rows.length === 0) return { started: 0, skipped: targets.length };
  const { error } = await getClient().from("sequence_enrollments").insert(rows);
  if (error) throw error;
  return { started: rows.length, skipped: targets.length - rows.length };
};

export const pauseEnrollment = async (id: string) => {
  const { error } = await getClient().from("sequence_enrollments").update({ status: "paused" }).eq("id", id);
  if (error) throw error;
};

/** Resumes where it left off: still waiting on a task/draft, or due to run the next step. */
export const resumeEnrollment = async (enrollment: Enrollment) => {
  const status = enrollment.pending_task_id || enrollment.pending_email_id ? "waiting" : "active";
  const { error } = await getClient().from("sequence_enrollments").update({ status }).eq("id", enrollment.id);
  if (error) throw error;
};

/**
 * Stops a sequence and cancels its waiting draft. Returns the waiting task's
 * id so the caller can remove it from the app's task list.
 */
export const stopEnrollment = async (enrollment: Enrollment, reason = "Stopped by you") => {
  const client = getClient();
  const { error } = await client
    .from("sequence_enrollments")
    .update({ status: "stopped", stop_reason: reason, finished_at: new Date().toISOString() })
    .eq("id", enrollment.id);
  if (error) throw error;
  if (enrollment.pending_email_id) {
    await client.from("emails").update({ status: "cancelled", error: `Sequence stopped: ${reason}` })
      .eq("id", enrollment.pending_email_id).eq("status", "draft");
  }
  return enrollment.pending_task_id;
};
