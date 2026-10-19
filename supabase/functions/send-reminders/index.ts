// Sends push notifications: task reminders at their due time and a morning
// digest. Called every 5 minutes by pg_cron (x-cron-secret header), or by a
// signed-in user with {"test": true} to send themselves a test notification.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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
const CLOSED_STAGES = new Set(["won", "lost"]);
const INACTIVE_OUTREACH_STATUSES = ["Won", "No", "Dead/Invalid", "Not Now"];

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Settings = {
  user_id: string;
  timezone: string;
  digest_enabled: boolean;
  digest_hour: number;
  last_digest_on: string | null;
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
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 },
      );
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // The browser unsubscribed or the subscription expired.
        await db.from("push_subscriptions").delete().eq("id", subscription.id);
      } else {
        console.error("push failed", subscription.endpoint.slice(0, 60), statusCode, error);
      }
    }
  }
  return sent;
};

const sendTaskReminders = async (
  db: SupabaseClient,
  userId: string,
  local: { date: string; minutes: number },
  subscriptions: Subscription[],
) => {
  const { data: tasks, error } = await db
    .from("tasks")
    .select("id, title, due_date, due_time, contact_id")
    .eq("user_id", userId)
    .eq("has_reminder", true)
    .eq("completed", false)
    .is("reminded_at", null)
    .not("due_time", "is", null)
    .lte("due_date", local.date);
  if (error) throw error;

  const due = (tasks ?? []).filter((task) => {
    const minutesLate =
      daysBetween(task.due_date, local.date) * 1440 + local.minutes - timeToMinutes(task.due_time);
    return minutesLate >= 0;
  });
  if (due.length === 0) return 0;

  const contactIds = [...new Set(due.map((task) => task.contact_id))];
  const { data: contacts } = await db.from("contacts").select("id, full_name, company").in("id", contactIds);
  const contactById = new Map((contacts ?? []).map((contact) => [contact.id, contact]));

  let sent = 0;
  for (const task of due) {
    const minutesLate =
      daysBetween(task.due_date, local.date) * 1440 + local.minutes - timeToMinutes(task.due_time);
    if (minutesLate <= REMINDER_MAX_LATE_MINUTES) {
      const contact = contactById.get(task.contact_id);
      const who = contact ? [contact.full_name, contact.company].filter(Boolean).join(" · ") : "";
      sent += await sendToSubscriptions(db, subscriptions, {
        title: task.title || "Follow-up due",
        body: [who, `due ${String(task.due_time).slice(0, 5)}`].filter(Boolean).join(" — "),
        url: `/contacts/${task.contact_id}`,
        tag: `task-${task.id}`,
      });
    }
    await db.from("tasks").update({ reminded_at: new Date().toISOString() }).eq("id", task.id);
  }
  return sent;
};

const buildDigest = async (db: SupabaseClient, userId: string, local: { date: string }) => {
  const [overdue, dueToday, stages, contacts, openTasks, outreach] = await Promise.all([
    db.from("tasks").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("completed", false).lt("due_date", local.date),
    db.from("tasks").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("completed", false).eq("due_date", local.date),
    db.from("stages").select("id, name").eq("user_id", userId),
    db.from("contacts").select("id, full_name, stage_id, last_interaction_at, created_at").eq("user_id", userId),
    db.from("tasks").select("contact_id").eq("user_id", userId).eq("completed", false),
    // Due through the end of the user's local day; a day of slack either side
    // of UTC is fine for a count.
    db.from("outreach_leads").select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("status", "in", `(${INACTIVE_OUTREACH_STATUSES.map((s) => `"${s}"`).join(",")})`)
      .lt("next_action_at", `${addDays(local.date, 1)}T00:00:00Z`),
  ]);

  const closedStageIds = new Set(
    (stages.data ?? [])
      .filter((stage) => CLOSED_STAGES.has(stage.id) || CLOSED_STAGES.has(String(stage.name).trim().toLowerCase()))
      .map((stage) => stage.id),
  );
  const withOpenTask = new Set((openTasks.data ?? []).map((task) => task.contact_id));
  const goingCold = (contacts.data ?? []).filter((contact) => {
    if (contact.full_name === "Me" || closedStageIds.has(contact.stage_id) || withOpenTask.has(contact.id)) {
      return false;
    }
    const lastTouch = (contact.last_interaction_at ?? contact.created_at ?? "").slice(0, 10);
    return lastTouch !== "" && daysBetween(lastTouch, local.date) >= COLD_AFTER_DAYS;
  }).length;

  const counts = {
    overdue: overdue.count ?? 0,
    dueToday: dueToday.count ?? 0,
    outreachDue: outreach.count ?? 0,
    goingCold,
  };
  const parts = [
    counts.overdue && `${counts.overdue} overdue`,
    counts.dueToday && `${counts.dueToday} due today`,
    counts.outreachDue && `${counts.outreachDue} outreach due`,
    counts.goingCold && `${counts.goingCold} going cold`,
  ].filter(Boolean);
  return { counts, body: parts.join(" · ") };
};

const runSchedule = async (db: SupabaseClient) => {
  const now = new Date();
  const { data: subscriptions, error } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth");
  if (error) throw error;

  const byUser = new Map<string, Subscription[]>();
  for (const subscription of subscriptions ?? []) {
    byUser.set(subscription.user_id, [...(byUser.get(subscription.user_id) ?? []), subscription]);
  }
  if (byUser.size === 0) return { users: 0, reminders: 0, digests: 0 };

  const { data: settingsRows } = await db
    .from("user_settings")
    .select("user_id, timezone, digest_enabled, digest_hour, last_digest_on")
    .in("user_id", [...byUser.keys()]);
  const settingsByUser = new Map((settingsRows ?? []).map((row: Settings) => [row.user_id, row]));

  let reminders = 0;
  let digests = 0;
  for (const [userId, userSubscriptions] of byUser) {
    const settings = settingsByUser.get(userId);
    const local = localNow(now, settings?.timezone ?? "UTC");

    reminders += await sendTaskReminders(db, userId, local, userSubscriptions);

    if (!settings?.digest_enabled) continue;
    const digestStart = settings.digest_hour * 60;
    const alreadySent = settings.last_digest_on !== null && settings.last_digest_on >= local.date;
    if (alreadySent || local.minutes < digestStart || local.minutes >= digestStart + DIGEST_WINDOW_MINUTES) continue;

    // Mark first so an overlapping run can't send it twice.
    await db.from("user_settings").update({ last_digest_on: local.date }).eq("user_id", userId);
    const digest = await buildDigest(db, userId, local);
    if (!digest.body) continue;
    await sendToSubscriptions(db, userSubscriptions, {
      title: "Your Figtree day",
      body: digest.body,
      url: "/app",
      tag: `digest-${local.date}`,
    });
    digests += 1;
  }
  return { users: byUser.size, reminders, digests };
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
  const sent = await sendToSubscriptions(db, subscriptions ?? [], {
    title: "Figtree notifications are on",
    body: "Task reminders arrive at their due time; your digest each morning.",
    url: "/app",
    tag: "test",
  });
  return json({ sent, devices: subscriptions?.length ?? 0 });
});
