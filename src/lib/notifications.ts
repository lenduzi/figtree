import { supabase } from "@/lib/supabase";

// Public half of the VAPID key pair; the private half is a secret of the
// send-reminders edge function.
const VAPID_PUBLIC_KEY =
  "BF1a1XF76b5ySQ2pc2gENvYmoZm8uo8Mj3RzkOyptBJPcpCPLByMF18x9sO4nut-pmqg_BWNKVGShsQTWLKyfaM";

export type UserSettings = {
  timezone: string;
  digest_enabled: boolean;
  digest_hour: number;
  email_notifications: boolean;
  ai_context: string;
  email_signature: string;
  research_budget_eur: number;
};

export type PushSupport = "supported" | "needs-install" | "unsupported";

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const getPushSupport = (): PushSupport => {
  // iOS only exposes web push to apps added to the Home Screen.
  if (isIos() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return "supported";
};

const getClient = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};

const urlBase64ToUint8Array = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

const getRegistration = async () => {
  // In production main.tsx registers the worker on load; make sure it exists.
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
};

/** This device's current push subscription, if notifications are on here. */
export const getCurrentSubscription = async () => {
  if (getPushSupport() !== "supported") return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
};

export const enablePushOnThisDevice = async () => {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Allow them in your browser settings."
        : "Notification permission was not granted.",
    );
  }
  const registration = await getRegistration();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  const keys = subscription.toJSON().keys ?? {};
  const { error } = await getClient()
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh ?? "",
        auth: keys.auth ?? "",
        user_agent: navigator.userAgent.slice(0, 300),
      },
      { onConflict: "endpoint" },
    );
  if (error) throw error;
};

export const disablePushOnThisDevice = async () => {
  const subscription = await getCurrentSubscription();
  if (!subscription) return;
  const { error } = await getClient().from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  if (error) throw error;
  await subscription.unsubscribe();
};

export const sendTestNotification = async () => {
  const { data, error } = await getClient().functions.invoke("send-reminders", { body: { test: true } });
  if (error) throw error;
  return data as { sent: number; devices: number; errors?: string[] };
};

export const getBrowserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export const loadUserSettings = async (): Promise<UserSettings | null> => {
  const { data, error } = await getClient()
    .from("user_settings")
    .select("timezone, digest_enabled, digest_hour, email_notifications, ai_context, email_signature, research_budget_eur")
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const saveUserSettings = async (changes: Partial<UserSettings>) => {
  const client = getClient();
  const { data } = await client.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Not signed in");
  const { error } = await client
    .from("user_settings")
    .upsert({ user_id: userId, ...changes }, { onConflict: "user_id" });
  if (error) throw error;
};

/** Keeps the server's idea of "9:00" and "today" in the user's timezone. */
export const syncTimeZone = async () => {
  const timezone = getBrowserTimeZone();
  const settings = await loadUserSettings();
  if (settings?.timezone === timezone) return;
  await saveUserSettings({ timezone });
};
