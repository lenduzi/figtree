import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type EmailAttachment = { path: string; filename: string; mime_type: string; size: number };

export const ATTACHMENTS_BUCKET = "email-attachments";
/** Gmail allows 25 MB of attachments per message. */
export const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

export type EmailStatus = "scheduled" | "sending" | "sent" | "failed" | "cancelled";

export type EmailRecord = {
  id: string;
  contact_id: string | null;
  to_email: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduled_for: string;
  sent_at: string | null;
  replied_at: string | null;
  error: string | null;
  attachments: EmailAttachment[];
  created_at: string;
};

const getClient = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};

/** Calls an edge function and surfaces its {error} message on failure. */
const invoke = async <T,>(name: string, body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await getClient().functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      throw new Error(details?.error ?? error.message);
    }
    throw error;
  }
  return data as T;
};

export const getGmailAccount = async () => {
  const { data, error } = await getClient().from("gmail_accounts").select("email, connected_at").maybeSingle();
  if (error) throw error;
  return data as { email: string; connected_at: string } | null;
};

/** Sends the browser to Google's consent screen; Google returns to `returnTo`. */
export const connectGmail = async (returnTo = `${window.location.origin}/settings`) => {
  const { url } = await invoke<{ url: string }>("gmail-oauth", { action: "start", redirectTo: returnTo });
  window.location.assign(url);
};

export const disconnectGmail = () => invoke("gmail-oauth", { action: "disconnect" });

export const listContactEmails = async (contactId: string) => {
  const { data, error } = await getClient()
    .from("emails")
    .select("id, contact_id, to_email, subject, body, status, scheduled_for, sent_at, replied_at, error, attachments, created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmailRecord[];
};

export const queueEmail = async (email: {
  contactId: string;
  to: string;
  subject: string;
  body: string;
  scheduledFor: Date;
  attachments?: EmailAttachment[];
}) => {
  const { data, error } = await getClient()
    .from("emails")
    .insert({
      contact_id: email.contactId,
      to_email: email.to,
      subject: email.subject,
      body: email.body,
      status: "scheduled",
      scheduled_for: email.scheduledFor.toISOString(),
      attachments: email.attachments ?? [],
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
};

export const sendEmailNow = (emailId: string) => invoke<{ sent: true }>("gmail-send", { emailId });

export const cancelEmail = async (emailId: string) => {
  const { error } = await getClient()
    .from("emails")
    .update({ status: "cancelled" })
    .eq("id", emailId)
    .eq("status", "scheduled");
  if (error) throw error;
};

export const draftEmail = (contactId: string, instructions: string) =>
  invoke<{ subject: string; body: string }>("draft-email", { contactId, instructions });

/** Uploads a file to the user's private attachment folder. */
export const uploadAttachment = async (file: File): Promise<EmailAttachment> => {
  const client = getClient();
  const { data } = await client.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Not signed in");
  // Storage keys are restricted; keep the real name in the metadata instead.
  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  const path = `${userId}/${crypto.randomUUID()}/${safeName}`;
  const { error } = await client.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return { path, filename: file.name, mime_type: file.type || "application/octet-stream", size: file.size };
};

export const removeAttachment = async (attachment: EmailAttachment) => {
  await getClient().storage.from(ATTACHMENTS_BUCKET).remove([attachment.path]);
};

export const formatFileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
