// Gmail API helpers shared by the gmail-oauth, gmail-send and send-reminders
// functions. Tokens live in public.gmail_tokens (service role only).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  // Headers only (From/Date/Subject) - enough to detect replies, never bodies.
  "https://www.googleapis.com/auth/gmail.metadata",
];

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const googleClientId = () => Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
export const googleClientSecret = () => Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
export const appUrl = () => Deno.env.get("APP_URL") ?? "https://www.figtreecrm.com";

/** Thrown when Google no longer accepts the stored refresh token. */
export class GmailAuthError extends Error {}

export const getAccessToken = async (db: SupabaseClient, userId: string) => {
  const { data: tokens, error } = await db
    .from("gmail_tokens")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!tokens) throw new GmailAuthError("Gmail is not connected");

  const expiresAt = tokens.access_token_expires_at ? Date.parse(tokens.access_token_expires_at) : 0;
  if (tokens.access_token && expiresAt - Date.now() > 60_000) return tokens.access_token as string;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    if (body?.error === "invalid_grant") {
      throw new GmailAuthError("Gmail access was revoked or expired. Reconnect Gmail in Settings.");
    }
    throw new Error(`Google token refresh failed: ${body?.error_description ?? body?.error ?? response.status}`);
  }
  await db
    .from("gmail_tokens")
    .update({
      access_token: body.access_token,
      access_token_expires_at: new Date(Date.now() + body.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return body.access_token as string;
};

const utf8ToBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const base64Url = (base64: string) => base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Header values must not contain line breaks (header injection).
const headerValue = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

const encodeHeaderWord = (value: string) =>
  // deno-lint-ignore no-control-regex
  /^[\x00-\x7F]*$/.test(value) ? headerValue(value) : `=?UTF-8?B?${utf8ToBase64(headerValue(value))}?=`;

export const buildMimeMessage = (message: { to: string; subject: string; body: string }) => {
  const encodedBody = utf8ToBase64(message.body.replace(/\r?\n/g, "\r\n")).replace(/.{76}/g, "$&\r\n");
  return [
    `To: ${headerValue(message.to)}`,
    `Subject: ${encodeHeaderWord(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
  ].join("\r\n");
};

export const sendGmail = async (
  accessToken: string,
  message: { to: string; subject: string; body: string; threadId?: string | null },
) => {
  const response = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      raw: base64Url(utf8ToBase64(buildMimeMessage(message))),
      ...(message.threadId ? { threadId: message.threadId } : {}),
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Gmail send failed: ${body?.error?.message ?? response.status}`);
  }
  return { id: body.id as string, threadId: body.threadId as string };
};

export type ThreadMessage = { id: string; internalDate: number; from: string };

export const getThreadMessages = async (accessToken: string, threadId: string): Promise<ThreadMessage[]> => {
  const url = `${GMAIL_API}/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 404) return [];
  const body = await response.json();
  if (!response.ok) throw new Error(`Gmail thread lookup failed: ${body?.error?.message ?? response.status}`);
  return (body.messages ?? []).map((message: {
    id: string;
    internalDate: string;
    payload?: { headers?: { name: string; value: string }[] };
  }) => ({
    id: message.id,
    internalDate: Number(message.internalDate),
    from: message.payload?.headers?.find((header) => header.name.toLowerCase() === "from")?.value ?? "",
  }));
};

/** "Jane Doe <jane@x.com>" -> "jane@x.com" */
export const emailAddressOf = (from: string) =>
  (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

/**
 * Sends one row of public.emails (already claimed as status 'sending') and
 * records the result, logging an activity on the contact when it went out.
 */
export const deliverEmailRow = async (
  db: SupabaseClient,
  email: { id: string; user_id: string; contact_id: string | null; to_email: string; subject: string; body: string },
) => {
  try {
    const accessToken = await getAccessToken(db, email.user_id);
    const sent = await sendGmail(accessToken, { to: email.to_email, subject: email.subject, body: email.body });
    const sentAt = new Date().toISOString();
    await db
      .from("emails")
      .update({
        status: "sent",
        sent_at: sentAt,
        gmail_message_id: sent.id,
        gmail_thread_id: sent.threadId,
        error: null,
      })
      .eq("id", email.id);
    if (email.contact_id) {
      await db.from("activities").insert({
        id: crypto.randomUUID(),
        user_id: email.user_id,
        contact_id: email.contact_id,
        type: "email",
        description: `Email sent: ${email.subject || "(no subject)"}`,
        occurred_at: sentAt,
      });
    }
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from("emails").update({ status: "failed", error: message }).eq("id", email.id);
    return { ok: false as const, error: message };
  }
};
