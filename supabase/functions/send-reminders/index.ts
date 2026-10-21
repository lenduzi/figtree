// The 5-minute job. Called by pg_cron (x-cron-secret header) it:
//   - runs sequences: stops them on reply or stage change, turns due steps
//     into call tasks or Claude drafts awaiting approval, and schedules the
//     next step once the current one is done
//   - sends scheduled emails and detects replies (users with Gmail connected)
//   - sends task reminders at their due time and the morning digest, as push
//     notifications and/or emails to the user's own Gmail
// A signed-in user can also call it with {"test": true} for a test notification.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import Anthropic from "npm:@anthropic-ai/sdk";
import { generateDraft } from "../_shared/drafting.ts";
import {
  appUrl,
  deliverEmailRow,
  emailAddressOf,
  getAccessToken,
  getThreadMessages,
  GmailAuthError,
  sendGmail,
} from "../_shared/gmail.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "https://figtreecrm.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

// Reminders more than this late (e.g. after downtime, or a task created with
// a time already in the past) are skipped instead of sent.
const REMINDER_MAX_LATE_MINUTES = 6 * 60;
// Don't send the digest if the job only gets to it hours after digest time.
const DIGEST_WINDOW_MINUTES = 3 * 60;
const COLD_AFTER_DAYS = 14;

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Settings = {
  user_id: string;
  timezone: string;
  digest_enabled: boolean;
  digest_hour: number;
  last_digest_on: string | null;
  email_notifications: boolean;
};
type Payload = { title: string; body: string; url: string; tag: string };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** The user's local calendar date (yyyy-MM-dd) and minutes since local midnight. */
const localNow = (now: Date, timeZone: string) => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return localNow(now, "UTC");
  }
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
};

const daysBetween = (fromDate: string, toDate: string) =>
  Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const sendToSubscriptions = async (db: SupabaseClient, subscriptions: Subscription[], payload: Payload) => {
  let sent = 0;
  const errors: string[] = [];
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 },
      );
      sent += 1;
    } catch (error) {
      const { statusCode, body } = error as { statusCode?: number; body?: string };
      const service = new URL(subscription.endpoint).host;
      errors.push(`${service}: ${statusCode ?? "error"} ${body || (error as Error).message || ""}`.trim());
      if (statusCode === 404 || statusCode === 410) {
        // The browser unsubscribed or the subscription expired.
        await db.from("push_subscriptions").delete().eq("id", subscription.id);
      } else {
        console.error("push failed", service, statusCode, error);
      }
    }
  }
  return { sent, errors };
};

type Channels = {
  subscriptions: Subscription[];
  // Set when the user has Gmail connected and email notifications on.
  notifyEmail: string | null;
};

/** Emails the user (from their own Gmail, to themselves). */
const emailSelf = async (db: SupabaseClient, userId: string, channels: Channels, subject: string, body: string) => {
  if (!channels.notifyEmail) return false;
  try {
    const accessToken = await getAccessToken(db, userId);
    await sendGmail(accessToken, { to: channels.notifyEmail, subject, text: body });
    return true;
  } catch (error) {
    console.error("self email failed", error);
    return false;
  }
};

const sendTaskReminders = async (
  db: SupabaseClient,
  userId: string,
  local: { date: string; minutes: number },
  channels: Channels,
) => {
  const { data: tasks, error } = await db
    .from("tasks")
    .select("id, title, description, due_date, due_time, contact_id, company_id")
    .eq("user_id", userId)
    .eq("has_reminder", true)
    .eq("completed", false)
    .is("reminded_at", null)
    .not("due_time", "is", null)
    .lte("due_date", local.date);
  if (error) throw error;

  const minutesLate = (task: { due_date: string; due_time: string }) =>
    daysBetween(task.due_date, local.date) * 1440 + local.minutes - timeToMinutes(task.due_time);
  const due = (tasks ?? []).filter((task) => minutesLate(task) >= 0);
  if (due.length === 0) return 0;

  const contactIds = [...new Set(due.map((task) => task.contact_id).filter(Boolean))];
  const companyIds = [...new Set(due.map((task) => task.company_id).filter(Boolean))];
  const [{ data: contacts }, { data: companies }] = await Promise.all([
    db.from("contacts").select("id, full_name").in("id", contactIds.length ? contactIds : ["00000000-0000-0000-0000-000000000000"]),
    db.from("companies").select("id, name").in("id", companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const contactById = new Map((contacts ?? []).map((contact) => [contact.id, contact]));
  const companyById = new Map((companies ?? []).map((company) => [company.id, company]));

  let sent = 0;
  for (const task of due) {
    // Mark first so an overlapping run can't remind twice.
    await db.from("tasks").update({ reminded_at: new Date().toISOString() }).eq("id", task.id);
    if (minutesLate(task) > REMINDER_MAX_LATE_MINUTES) continue;

    const who = [contactById.get(task.contact_id)?.full_name, companyById.get(task.company_id)?.name]
      .filter(Boolean)
      .join(" · ");
    const link = task.company_id ? `${appUrl()}/companies/${task.company_id}` : `${appUrl()}/app`;
    const time = String(task.due_time).slice(0, 5);
    const push = await sendToSubscriptions(db, channels.subscriptions, {
      title: task.title || "Follow-up due",
      body: [who, `due ${time}`].filter(Boolean).join(" — "),
      url: task.company_id ? `/companies/${task.company_id}` : "/app",
      tag: `task-${task.id}`,
    });
    const emailed = await emailSelf(
      db,
      userId,
      channels,
      `Reminder: ${task.title || "Follow-up"} (${time})`,
      [
        who && `Contact: ${who}`,
        task.description,
        "",
        `Open in Figtree: ${link}`,
      ].filter((line) => typeof line === "string").join("\n"),
    );
    if (push.sent > 0 || emailed) sent += 1;
  }
  return sent;
};

const OPEN_DEAL_STAGES = ["talking", "meeting", "proposal", "pilot"];
const CALL_STAGES = ["sourced", "qualified", "contacting", "talking"];

const buildDigest = async (db: SupabaseClient, userId: string, local: { date: string }) => {
  const [openTasks, companies, callsDue, drafts, prospects] = await Promise.all([
    db.from("tasks").select("title, due_date, company_id, contact_id").eq("user_id", userId).eq("completed", false)
      .order("due_date"),
    db.from("companies").select("id, name, city, lifecycle, last_activity_at, lifecycle_changed_at, created_at")
      .eq("user_id", userId),
    // Due through the end of the user's local day; a day of slack either side
    // of UTC is fine for a count.
    db.from("companies").select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("lifecycle", CALL_STAGES)
      .neq("phone", "")
      .lt("next_action_at", `${addDays(local.date, 1)}T00:00:00Z`),
    db.from("emails").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "draft"),
    db.from("companies").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("needs_review", true)
      .not("fit", "is", null),
  ]);
  const toApprove = drafts.count ?? 0;
  const newProspects = prospects.count ?? 0;

  const tasks = openTasks.data ?? [];
  const companyById = new Map((companies.data ?? []).map((company) => [company.id, company]));
  const withOpenTask = new Set(tasks.map((task) => task.company_id).filter(Boolean));
  const goingCold = (companies.data ?? [])
    .filter((company) => OPEN_DEAL_STAGES.includes(company.lifecycle) && !withOpenTask.has(company.id))
    .map((company) => {
      const lastTouch = (company.last_activity_at ?? company.lifecycle_changed_at ?? company.created_at ?? "").slice(0, 10);
      return { company, days: lastTouch ? daysBetween(lastTouch, local.date) : 0 };
    })
    .filter(({ days }) => days >= COLD_AFTER_DAYS)
    .sort((a, b) => b.days - a.days);

  const dueNow = tasks.filter((task) => task.due_date <= local.date);
  const business = dueNow.filter((task) => task.company_id || task.contact_id);
  const personal = dueNow.filter((task) => !task.company_id && !task.contact_id);
  const overdue = business.filter((task) => task.due_date < local.date);
  const dueToday = business.filter((task) => task.due_date === local.date);
  const calls = callsDue.count ?? 0;

  const summary = [
    toApprove && `${toApprove} emails to approve`,
    newProspects && `${newProspects} new prospects`,
    overdue.length && `${overdue.length} overdue`,
    dueToday.length && `${dueToday.length} due today`,
    calls && `${calls} calls due`,
    goingCold.length && `${goingCold.length} going cold`,
    personal.length && `${personal.length} personal`,
  ].filter(Boolean).join(" · ");

  const taskLine = (task: { title: string; due_date: string; company_id: string | null }) => {
    const company = task.company_id ? companyById.get(task.company_id) : null;
    return `- ${task.title}${company ? ` — ${company.name}` : ""}${task.due_date < local.date ? ` (due ${task.due_date})` : ""}`;
  };
  const lines: string[] = ["Here's what needs your attention today.", ""];
  if (toApprove) lines.push(`Emails to approve: ${toApprove} — ${appUrl()}/app`, "");
  if (newProspects) lines.push(`New prospects to review: ${newProspects} — ${appUrl()}/prospecting`, "");
  if (overdue.length) lines.push(`Overdue (${overdue.length})`, ...overdue.slice(0, 15).map(taskLine), "");
  if (dueToday.length) lines.push(`Due today (${dueToday.length})`, ...dueToday.slice(0, 15).map(taskLine), "");
  if (calls) lines.push(`Calls due: ${calls} — ${appUrl()}/calls`, "");
  if (goingCold.length) {
    lines.push(
      `Going cold (${goingCold.length}) — open deals, no task planned, quiet ${COLD_AFTER_DAYS}+ days`,
      ...goingCold.slice(0, 8).map(({ company, days }) =>
        `- ${company.name}${company.city ? `, ${company.city}` : ""} (${days} days)`
      ),
      "",
    );
  }
  if (personal.length) lines.push(`Personal (${personal.length})`, ...personal.slice(0, 10).map(taskLine), "");
  lines.push(`Open Figtree: ${appUrl()}/app`);

  return { summary, emailBody: lines.join("\n") };
};

const processScheduledEmails = async (db: SupabaseClient, userId: string) => {
  const { data: due } = await db
    .from("emails")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(20);
  let sent = 0;
  for (const { id } of due ?? []) {
    // Claim it, so the send-now path or an overlapping run can't send it too.
    const { data: email } = await db
      .from("emails")
      .update({ status: "sending" })
      .eq("id", id)
      .eq("status", "scheduled")
      .select("id, user_id, contact_id, company_id, to_email, subject, body, attachments, reply_to_email_id")
      .maybeSingle();
    if (!email) continue;
    if ((await deliverEmailRow(db, email)).ok) sent += 1;
  }
  return sent;
};

const REPLY_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const REPLY_CHECK_WINDOW_DAYS = 30;
const NOT_A_REPLY = /mailer-daemon|postmaster|no-?reply/i;

const checkReplies = async (
  db: SupabaseClient,
  userId: string,
  local: { date: string },
  ownAddress: string,
) => {
  const now = Date.now();
  const { data: emails } = await db
    .from("emails")
    .select("id, contact_id, company_id, subject, sent_at, gmail_thread_id, reply_checked_at")
    .eq("user_id", userId)
    .eq("status", "sent")
    .is("replied_at", null)
    .not("gmail_thread_id", "is", null)
    .gte("sent_at", new Date(now - REPLY_CHECK_WINDOW_DAYS * 86_400_000).toISOString())
    .order("sent_at", { ascending: false })
    .limit(50);
  const toCheck = (emails ?? []).filter((email) =>
    !email.reply_checked_at || now - Date.parse(email.reply_checked_at) > REPLY_CHECK_INTERVAL_MS
  );
  if (toCheck.length === 0) return 0;

  const accessToken = await getAccessToken(db, userId);
  const own = ownAddress.toLowerCase();
  let replies = 0;
  for (const email of toCheck) {
    const messages = await getThreadMessages(accessToken, email.gmail_thread_id);
    const sentAt = Date.parse(email.sent_at);
    const reply = messages.find((message) => {
      const from = emailAddressOf(message.from);
      return from && from !== own && !NOT_A_REPLY.test(from) && message.internalDate > sentAt;
    });
    const checkedAt = new Date().toISOString();
    if (!reply) {
      await db.from("emails").update({ reply_checked_at: checkedAt }).eq("id", email.id);
      continue;
    }

    const repliedAt = new Date(reply.internalDate).toISOString();
    await db.from("emails").update({ replied_at: repliedAt, reply_checked_at: checkedAt }).eq("id", email.id);
    replies += 1;
    if (!email.contact_id && !email.company_id) continue;

    const { data: contact } = email.contact_id
      ? await db.from("contacts").select("full_name").eq("id", email.contact_id).maybeSingle()
      : { data: null };
    const name = contact?.full_name || emailAddressOf(reply.from);
    await db.from("activities").insert({
      id: crypto.randomUUID(),
      user_id: userId,
      contact_id: email.contact_id,
      company_id: email.company_id,
      type: "email",
      description: `Reply received: ${email.subject || "(no subject)"}`,
      occurred_at: repliedAt,
    });
    await db.from("tasks").insert({
      id: crypto.randomUUID(),
      user_id: userId,
      contact_id: email.contact_id,
      company_id: email.company_id,
      title: `Reply from ${name}`,
      description: `Re: ${email.subject || "(no subject)"} — detected in Gmail`,
      due_date: local.date,
      has_reminder: false,
      completed: false,
    });
    // They replied: stop any follow-ups still queued for them (or their company).
    await db
      .from("emails")
      .update({ status: "cancelled", error: "Cancelled automatically: contact replied" })
      .eq(email.company_id ? "company_id" : "contact_id", email.company_id ?? email.contact_id)
      .eq("status", "scheduled");
  }
  return replies;
};


// Sequences ------------------------------------------------------------------

const FUNNEL = ["sourced", "qualified", "contacting", "talking", "meeting", "proposal", "pilot", "customer"];
const EXIT_STAGES = ["not_now", "lost", "disqualified"];
const MAX_DRAFTS_PER_RUN = 3;
const SEQUENCE_START_MINUTES = 7 * 60;

type SequenceStep = {
  wait_days: number;
  channel: "call" | "email";
  label: string;
  instructions: string;
  reply_in_thread?: boolean;
};

/**
 * A play stops once the company has moved on: any exit stage or customer, or
 * past where it started (with sourced/qualified allowed to reach contacting,
 * since cold calling moves them there).
 */
const sequenceShouldStop = (startStage: string, current: string) => {
  if (current === startStage) return false;
  if (EXIT_STAGES.includes(current) || current === "customer") return true;
  const floor = Math.max(FUNNEL.indexOf(startStage), FUNNEL.indexOf("contacting"));
  return FUNNEL.indexOf(current) > floor;
};

/** The date n business days after `date` (n = 0: the date itself, or the next weekday). */
const addBusinessDays = (date: string, n: number) => {
  let time = Date.parse(`${date}T00:00:00Z`);
  const isWeekend = (t: number) => [0, 6].includes(new Date(t).getUTCDay());
  let added = 0;
  while (added < n) {
    time += 86_400_000;
    if (!isWeekend(time)) added += 1;
  }
  while (isWeekend(time)) time += 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
};

type Enrollment = {
  id: string;
  sequence_id: string;
  company_id: string;
  contact_id: string | null;
  to_email: string;
  status: string;
  step_index: number;
  next_step_on: string | null;
  start_lifecycle: string;
  pending_task_id: string | null;
  pending_email_id: string | null;
  last_email_id: string | null;
  started_at: string;
  sequences: { name: string; steps: SequenceStep[] } | null;
  companies: { id: string; name: string; lifecycle: string; email: string } | null;
  contacts: { email: string; full_name: string } | null;
};

const stopEnrollment = async (db: SupabaseClient, enrollment: Enrollment, reason: string) => {
  await db
    .from("sequence_enrollments")
    .update({ status: "stopped", stop_reason: reason, finished_at: new Date().toISOString() })
    .eq("id", enrollment.id);
  // Drop what the play prepared but the user hasn't acted on.
  if (enrollment.pending_email_id) {
    await db.from("emails").update({ status: "cancelled", error: `Sequence stopped: ${reason}` })
      .eq("id", enrollment.pending_email_id).eq("status", "draft");
  }
  if (enrollment.pending_task_id) {
    await db.from("tasks").delete().eq("id", enrollment.pending_task_id).eq("completed", false);
  }
};

const advanceEnrollment = async (
  db: SupabaseClient,
  enrollment: Enrollment,
  localDate: string,
  extra: Record<string, unknown> = {},
) => {
  const steps = enrollment.sequences?.steps ?? [];
  const next = enrollment.step_index + 1;
  if (next >= steps.length) {
    await db.from("sequence_enrollments").update({
      ...extra,
      status: "completed",
      step_index: next,
      pending_task_id: null,
      pending_email_id: null,
      next_step_on: null,
      finished_at: new Date().toISOString(),
    }).eq("id", enrollment.id);
    return;
  }
  await db.from("sequence_enrollments").update({
    ...extra,
    status: "active",
    step_index: next,
    pending_task_id: null,
    pending_email_id: null,
    next_step_on: addBusinessDays(localDate, Math.max(0, steps[next].wait_days ?? 0)),
  }).eq("id", enrollment.id);
};

const runSequences = async (
  db: SupabaseClient,
  anthropic: Anthropic | null,
  userId: string,
  local: { date: string; minutes: number },
) => {
  const { data } = await db
    .from("sequence_enrollments")
    .select(
      "id, sequence_id, company_id, contact_id, to_email, status, step_index, next_step_on, start_lifecycle, " +
        "pending_task_id, pending_email_id, last_email_id, started_at, " +
        "sequences(name, steps), companies(id, name, lifecycle, email), contacts(email, full_name)",
    )
    .eq("user_id", userId)
    .in("status", ["active", "waiting"]);
  const enrollments = (data ?? []) as unknown as Enrollment[];
  const totals = { steps: 0, drafts: 0, stopped: 0, advanced: 0 };
  let draftsLeft = MAX_DRAFTS_PER_RUN;

  for (const enrollment of enrollments) {
    const company = enrollment.companies;
    const steps = enrollment.sequences?.steps ?? [];
    if (!company || steps.length === 0) continue;

    // 1. Stop when they replied or the company moved on.
    const { count: replies } = await db.from("emails").select("id", { count: "exact", head: true })
      .eq("company_id", company.id).gte("replied_at", enrollment.started_at);
    if (replies) {
      await stopEnrollment(db, enrollment, "They replied");
      totals.stopped += 1;
      continue;
    }
    if (sequenceShouldStop(enrollment.start_lifecycle, company.lifecycle)) {
      await stopEnrollment(db, enrollment, `Moved to ${company.lifecycle.replace("_", " ")}`);
      totals.stopped += 1;
      continue;
    }

    // 2. A step is waiting on the user: move on once it's done.
    if (enrollment.status === "waiting") {
      if (enrollment.pending_task_id) {
        const { data: task } = await db.from("tasks").select("completed").eq("id", enrollment.pending_task_id).maybeSingle();
        if (task && !task.completed) continue;
        await advanceEnrollment(db, enrollment, local.date);
      } else if (enrollment.pending_email_id) {
        const { data: email } = await db.from("emails").select("id, status").eq("id", enrollment.pending_email_id).maybeSingle();
        if (email?.status === "sent") {
          await advanceEnrollment(db, enrollment, local.date, { last_email_id: email.id });
        } else if (!email || email.status === "cancelled") {
          await advanceEnrollment(db, enrollment, local.date); // skipped
        } else {
          continue; // draft, scheduled, sending or failed: still the user's move
        }
      } else {
        await advanceEnrollment(db, enrollment, local.date);
      }
      totals.advanced += 1;
      continue;
    }

    // 3. Run a due step.
    if (!enrollment.next_step_on || enrollment.next_step_on > local.date || local.minutes < SEQUENCE_START_MINUTES) continue;
    const step = steps[enrollment.step_index];
    if (!step) {
      await advanceEnrollment(db, enrollment, local.date);
      continue;
    }
    const position = `${enrollment.sequences?.name} · step ${enrollment.step_index + 1}/${steps.length}`;
    const address = enrollment.to_email || enrollment.contacts?.email || company.email || "";

    const waitOnTask = async (title: string, description: string) => {
      const taskId = crypto.randomUUID();
      await db.from("tasks").insert({
        id: taskId,
        user_id: userId,
        company_id: company.id,
        contact_id: enrollment.contact_id,
        title,
        description,
        due_date: local.date,
        has_reminder: false,
        completed: false,
      });
      await db.from("sequence_enrollments").update({ status: "waiting", pending_task_id: taskId }).eq("id", enrollment.id);
      totals.steps += 1;
    };

    if (step.channel === "call") {
      await waitOnTask(`Call ${company.name}: ${step.label}`, `${position}\n\n${step.instructions}`.trim());
      continue;
    }
    if (!address.includes("@")) {
      await waitOnTask(
        `Email ${company.name}: ${step.label}`,
        `${position}\n\nNo email address on file. Find one (or call instead), then: ${step.instructions}`.trim(),
      );
      continue;
    }
    if (!anthropic || draftsLeft <= 0) continue; // drafted on a later run
    draftsLeft -= 1;

    const { data: previous } = enrollment.last_email_id
      ? await db.from("emails").select("id, subject").eq("id", enrollment.last_email_id).maybeSingle()
      : { data: null };
    const inThread = Boolean(step.reply_in_thread && previous);
    try {
      const draft = await generateDraft(db, anthropic, {
        userId,
        companyId: company.id,
        contactId: enrollment.contact_id,
        instructions: [
          `This is step ${enrollment.step_index + 1} of ${steps.length} of the play "${enrollment.sequences?.name}": ${step.label}.`,
          step.instructions,
          inThread
            ? "Write it as a short reply in the same thread as the previous email in this play: don't repeat it, add one new thing."
            : "",
        ].filter(Boolean).join("\n"),
      });
      const subject = inThread && previous
        ? (/^re:/i.test(previous.subject) ? previous.subject : `Re: ${previous.subject}`)
        : draft.subject;
      const { data: email } = await db.from("emails").insert({
        user_id: userId,
        company_id: company.id,
        contact_id: enrollment.contact_id,
        to_email: address,
        subject,
        body: draft.body,
        ai_draft: draft.body,
        attachments: draft.attachments,
        status: "draft",
        scheduled_for: new Date().toISOString(),
        enrollment_id: enrollment.id,
        step_index: enrollment.step_index,
        reply_to_email_id: inThread ? previous?.id : null,
      }).select("id").single();
      await db.from("sequence_enrollments").update({ status: "waiting", pending_email_id: email?.id }).eq("id", enrollment.id);
      totals.steps += 1;
      totals.drafts += 1;
    } catch (error) {
      // Left as is; the next run tries again.
      console.error("sequence draft failed", enrollment.id, error);
    }
  }
  return totals;
};

const runSchedule = async (db: SupabaseClient) => {
  const now = new Date();
  const [{ data: subscriptions, error }, { data: gmailAccounts }, { data: running }] = await Promise.all([
    db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth"),
    db.from("gmail_accounts").select("user_id, email"),
    db.from("sequence_enrollments").select("user_id").in("status", ["active", "waiting"]),
  ]);
  const anthropic = Deno.env.get("ANTHROPIC_API_KEY") ? new Anthropic() : null;
  if (error) throw error;

  const subscriptionsByUser = new Map<string, Subscription[]>();
  for (const subscription of subscriptions ?? []) {
    subscriptionsByUser.set(subscription.user_id, [...(subscriptionsByUser.get(subscription.user_id) ?? []), subscription]);
  }
  const gmailByUser = new Map((gmailAccounts ?? []).map((account) => [account.user_id, account.email as string]));
  const userIds = [
    ...new Set([...subscriptionsByUser.keys(), ...gmailByUser.keys(), ...(running ?? []).map((row) => row.user_id)]),
  ];
  const totals = { users: userIds.length, emailsSent: 0, replies: 0, reminders: 0, digests: 0, sequenceSteps: 0, drafts: 0, sequencesStopped: 0 };
  if (userIds.length === 0) return totals;

  const { data: settingsRows } = await db
    .from("user_settings")
    .select("user_id, timezone, digest_enabled, digest_hour, last_digest_on, email_notifications")
    .in("user_id", userIds);
  const settingsByUser = new Map((settingsRows ?? []).map((row: Settings) => [row.user_id, row]));

  for (const userId of userIds) {
    const settings = settingsByUser.get(userId);
    const local = localNow(now, settings?.timezone ?? "UTC");
    const gmail = gmailByUser.get(userId) ?? null;
    const channels: Channels = {
      subscriptions: subscriptionsByUser.get(userId) ?? [],
      notifyEmail: gmail && (settings?.email_notifications ?? true) ? gmail : null,
    };

    if (gmail) {
      try {
        totals.emailsSent += await processScheduledEmails(db, userId);
        totals.replies += await checkReplies(db, userId, local, gmail);
      } catch (error) {
        // Typically GmailAuthError (access revoked); reminders below still run.
        console.error("gmail work failed", userId, error instanceof GmailAuthError ? error.message : error);
      }
    }

    // After reply detection, so a fresh reply stops a play before its next step.
    try {
      const sequences = await runSequences(db, anthropic, userId, local);
      totals.sequenceSteps += sequences.steps;
      totals.drafts += sequences.drafts;
      totals.sequencesStopped += sequences.stopped;
    } catch (error) {
      console.error("sequences failed", userId, error);
    }

    totals.reminders += await sendTaskReminders(db, userId, local, channels);

    if (!settings?.digest_enabled) continue;
    const digestStart = settings.digest_hour * 60;
    const alreadySent = settings.last_digest_on !== null && settings.last_digest_on >= local.date;
    if (alreadySent || local.minutes < digestStart || local.minutes >= digestStart + DIGEST_WINDOW_MINUTES) continue;

    // Mark first so an overlapping run can't send it twice.
    await db.from("user_settings").update({ last_digest_on: local.date }).eq("user_id", userId);
    const digest = await buildDigest(db, userId, local);
    if (!digest.summary) continue;
    await sendToSubscriptions(db, channels.subscriptions, {
      title: "Your Figtree day",
      body: digest.summary,
      url: "/app",
      tag: `digest-${local.date}`,
    });
    await emailSelf(db, userId, channels, `Your Figtree day: ${digest.summary}`, digest.emailBody);
    totals.digests += 1;
  }
  return totals;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  if (CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) {
    try {
      return json(await runSchedule(db));
    } catch (error) {
      console.error("schedule run failed", error);
      return json({ error: String(error) }, 500);
    }
  }

  // Otherwise only a signed-in user sending themselves a test notification.
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: userData } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!userData.user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  if (!body?.test) return json({ error: "unsupported request" }, 400);

  const { data: subscriptions } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("user_id", userData.user.id);
  const { sent, errors } = await sendToSubscriptions(db, subscriptions ?? [], {
    title: "Figtree notifications are on",
    body: "Task reminders arrive at their due time; your digest each morning.",
    url: "/app",
    tag: "test",
  });
  return json({ sent, devices: subscriptions?.length ?? 0, errors });
});
