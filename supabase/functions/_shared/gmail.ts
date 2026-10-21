// Gmail API helpers shared by the gmail-oauth, gmail-send and send-reminders
// functions. Tokens live in public.gmail_tokens (service role only).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  // Headers only (From/Date/Subject) - enough to detect replies, never bodies.
  "https://www.googleapis.com/auth/gmail.metadata",
];
// Read-only access to Gmail settings, used to append the user's real Gmail
// signature. Optional: without it Figtree falls back to its own signature.
export const GMAIL_SIGNATURE_SCOPE = "https://www.googleapis.com/auth/gmail.settings.basic";

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

const utf8ToBase64 = (text: string) => bytesToBase64(new TextEncoder().encode(text));

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

// Base64 bodies in MIME are wrapped at 76 characters.
const wrapBase64 = (base64: string) => base64.replace(/.{76}/g, "$&\r\n");

// Header values must not contain line breaks (header injection).
const headerValue = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

const encodeHeaderWord = (value: string) =>
  // deno-lint-ignore no-control-regex
  /^[\x00-\x7F]*$/.test(value) ? headerValue(value) : `=?UTF-8?B?${utf8ToBase64(headerValue(value))}?=`;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const linkify = (escaped: string) =>
  escaped.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g, (url) => `<a href="${url}">${url}</a>`);

/**
 * Plain text -> HTML in the shape Gmail's own composer produces (one div per
 * line, empty div between paragraphs), so it reads like a hand-written email.
 */
export const textToGmailHtml = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n")
    .map((line) => (line.trim() ? `<div>${linkify(escapeHtml(line))}</div>` : "<div><br></div>"))
    .join("");

/** Rough HTML -> text for the plain-text alternative of a signature. */
export const htmlToText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export type MailAttachment = { filename: string; mimeType: string; data: Uint8Array };

/** Headers that make a message a reply in an existing thread. */
export type ThreadReply = { threadId: string; inReplyTo: string };

export const buildMimeMessage = (message: {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
  reply?: ThreadReply | null;
}) => {
  const boundary = (label: string) => `figtree_${label}_${crypto.randomUUID().replace(/-/g, "")}`;
  const alternativeBoundary = boundary("alt");
  const alternative = [
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(utf8ToBase64(message.text.replace(/\r?\n/g, "\r\n"))),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(utf8ToBase64(`<div dir="ltr">${message.html}</div>`)),
    `--${alternativeBoundary}--`,
  ];

  const headers = [
    `To: ${headerValue(message.to)}`,
    `Subject: ${encodeHeaderWord(message.subject)}`,
    "MIME-Version: 1.0",
    ...(message.reply?.inReplyTo
      ? [`In-Reply-To: ${headerValue(message.reply.inReplyTo)}`, `References: ${headerValue(message.reply.inReplyTo)}`]
      : []),
  ];

  const attachments = message.attachments ?? [];
  if (attachments.length === 0) return [...headers, ...alternative].join("\r\n");

  const mixedBoundary = boundary("mixed");
  const parts = attachments.flatMap((attachment) => {
    const name = encodeHeaderWord(attachment.filename.replace(/"/g, ""));
    return [
      `--${mixedBoundary}`,
      `Content-Type: ${headerValue(attachment.mimeType || "application/octet-stream")}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(bytesToBase64(attachment.data)),
    ];
  });
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    ...alternative,
    ...parts,
    `--${mixedBoundary}--`,
  ].join("\r\n");
};

/**
 * Sends a message through the upload endpoint, which accepts messages up to
 * 35 MB (the JSON endpoint is limited to a few MB). Replies go out as a
 * multipart upload so the thread id can travel with the message.
 */
export const sendGmail = async (
  accessToken: string,
  message: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: MailAttachment[];
    reply?: ThreadReply | null;
  },
) => {
  const raw = buildMimeMessage({ ...message, html: message.html ?? textToGmailHtml(message.text) });
  const upload = "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send";
  let response: Response;
  if (message.reply?.threadId) {
    const boundary = `figtree_upload_${crypto.randomUUID().replace(/-/g, "")}`;
    response = await fetch(`${upload}?uploadType=multipart`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body: [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify({ threadId: message.reply.threadId }),
        `--${boundary}`,
        "Content-Type: message/rfc822",
        "",
        raw,
        `--${boundary}--`,
      ].join("\r\n"),
    });
  } else {
    response = await fetch(`${upload}?uploadType=media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "message/rfc822" },
      body: raw,
    });
  }
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Gmail send failed: ${body?.error?.message ?? response.status}`);
  }
  return { id: body.id as string, threadId: body.threadId as string };
};

/** The RFC Message-ID header of a sent message (needed to reply to it). */
export const getMessageIdHeader = async (accessToken: string, gmailMessageId: string) => {
  const response = await fetch(
    `${GMAIL_API}/messages/${encodeURIComponent(gmailMessageId)}?format=metadata&metadataHeaders=Message-ID`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return "";
  const body = await response.json();
  return (body.payload?.headers ?? []).find((header: { name: string }) => header.name.toLowerCase() === "message-id")?.value ?? "";
};

/** The HTML signature Gmail would add for this address, or "" if unavailable. */
export const getGmailSignature = async (accessToken: string, address: string) => {
  const response = await fetch(`${GMAIL_API}/settings/sendAs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 403 = the optional settings scope wasn't granted.
  if (!response.ok) return "";
  const body = await response.json();
  const sendAs: { sendAsEmail: string; signature?: string; isDefault?: boolean; isPrimary?: boolean }[] =
    body.sendAs ?? [];
  const match =
    sendAs.find((entry) => entry.sendAsEmail.toLowerCase() === address.toLowerCase()) ??
    sendAs.find((entry) => entry.isDefault) ??
    sendAs.find((entry) => entry.isPrimary);
  return match?.signature?.trim() ?? "";
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

export type EmailAttachmentRef = { path: string; filename: string; mime_type: string; size: number };

const ATTACHMENTS_BUCKET = "email-attachments";

/**
 * Sends one row of public.emails (already claimed as status 'sending') and
 * records the result, logging an activity on the contact when it went out.
 * Appends the user's Gmail signature (or Figtree's fallback signature) and
 * any attachments from storage.
 */
export const deliverEmailRow = async (
  db: SupabaseClient,
  email: {
    id: string;
    user_id: string;
    contact_id: string | null;
    company_id?: string | null;
    to_email: string;
    subject: string;
    body: string;
    attachments?: EmailAttachmentRef[] | null;
    reply_to_email_id?: string | null;
  },
) => {
  try {
    const accessToken = await getAccessToken(db, email.user_id);

    // Follow-ups go into the thread of the email they follow up on.
    let reply: ThreadReply | null = null;
    if (email.reply_to_email_id) {
      const { data: original } = await db
        .from("emails")
        .select("gmail_message_id, gmail_thread_id")
        .eq("id", email.reply_to_email_id)
        .maybeSingle();
      if (original?.gmail_thread_id && original.gmail_message_id) {
        reply = {
          threadId: original.gmail_thread_id,
          inReplyTo: await getMessageIdHeader(accessToken, original.gmail_message_id),
        };
      }
    }

    const [{ data: account }, { data: settings }] = await Promise.all([
      db.from("gmail_accounts").select("email").eq("user_id", email.user_id).maybeSingle(),
      db.from("user_settings").select("email_signature").eq("user_id", email.user_id).maybeSingle(),
    ]);
    const gmailSignature = account?.email ? await getGmailSignature(accessToken, account.email) : "";
    const fallbackSignature = settings?.email_signature?.trim() ?? "";

    let text = email.body.trim();
    let html = textToGmailHtml(text);
    if (gmailSignature) {
      text += `\n\n-- \n${htmlToText(gmailSignature)}`;
      html += `<br><div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature">${gmailSignature}</div>`;
    } else if (fallbackSignature) {
      text += `\n\n${fallbackSignature}`;
      html += `<div><br></div>${textToGmailHtml(fallbackSignature)}`;
    }

    const attachments: MailAttachment[] = [];
    for (const ref of email.attachments ?? []) {
      const { data: file, error } = await db.storage.from(ATTACHMENTS_BUCKET).download(ref.path);
      if (error || !file) throw new Error(`Attachment "${ref.filename}" could not be loaded.`);
      attachments.push({
        filename: ref.filename,
        mimeType: ref.mime_type,
        data: new Uint8Array(await file.arrayBuffer()),
      });
    }

    const sent = await sendGmail(accessToken, { to: email.to_email, subject: email.subject, text, html, attachments, reply });
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
    if (email.contact_id || email.company_id) {
      const attachmentNote = attachments.length
        ? ` (${attachments.length} attachment${attachments.length === 1 ? "" : "s"})`
        : "";
      await db.from("activities").insert({
        id: crypto.randomUUID(),
        user_id: email.user_id,
        contact_id: email.contact_id,
        company_id: email.company_id ?? null,
        type: "email",
        description: `Email sent: ${email.subject || "(no subject)"}${attachmentNote}`,
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
