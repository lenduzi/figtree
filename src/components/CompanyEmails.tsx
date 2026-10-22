import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, formatDistanceToNow, setHours, setMinutes, startOfDay } from 'date-fns';
import { History, Loader2, Mail, Paperclip, Send, SkipForward, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCRMContext } from '@/contexts/CRMContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmailRewriteBar } from '@/components/EmailRewriteBar';
import {
  approveDraft,
  cancelEmail,
  discardDraft,
  draftEmail,
  formatFileSize,
  getGmailAccount,
  getOpenDraft,
  listCompanyEmails,
  MAX_ATTACHMENTS_BYTES,
  MAX_DRAFT_VERSIONS,
  removeAttachment,
  saveDraft,
  sendEmailNow,
  skipDraft,
  uploadAttachment,
  type DraftVersion,
  type EmailAttachment,
  type EmailRecord,
} from '@/lib/gmail';
import type { Company, Contact } from '@/types/crm';

const OTHER_RECIPIENT = 'other';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const toLocalInputValue = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");
const tomorrowAtNine = () => setMinutes(setHours(startOfDay(addDays(new Date(), 1)), 9), 0);

const statusBadge = (email: EmailRecord) => {
  if (email.replied_at) return <Badge>Replied</Badge>;
  switch (email.status) {
    case 'draft':
      return <Badge variant="outline">{email.enrollment_id ? 'To approve' : 'Draft'}</Badge>;
    case 'scheduled':
      return <Badge variant="outline">Scheduled</Badge>;
    case 'sending':
      return <Badge variant="outline">Sending…</Badge>;
    case 'sent':
      return <Badge variant="secondary">Sent</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'cancelled':
      return <Badge variant="outline">Cancelled</Badge>;
  }
};

const statusDetail = (email: EmailRecord) => {
  if (email.replied_at) return `Replied ${formatDistanceToNow(new Date(email.replied_at), { addSuffix: true })}`;
  if (email.status === 'draft') {
    return email.enrollment_id
      ? 'Drafted by a sequence, waiting for you in Today'
      : `Not sent yet · last edited ${formatDistanceToNow(new Date(email.created_at), { addSuffix: true })}`;
  }
  if (email.status === 'scheduled') return `Sends ${format(new Date(email.scheduled_for), 'EEE d MMM, HH:mm')}`;
  if (email.status === 'sent' && email.sent_at) {
    return `Sent ${formatDistanceToNow(new Date(email.sent_at), { addSuffix: true })} · no reply yet`;
  }
  return email.error ?? '';
};

type EmailComposeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company;
  people: Contact[];
  gmailAddress?: string;
  /** A specific draft to open (a sequence draft to approve, or one you were writing). */
  draft?: EmailRecord | null;
  /** Called after an email was sent, scheduled, skipped, saved or discarded. */
  onDone?: () => void;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const AUTOSAVE_DELAY_MS = 800;

/**
 * Compose (or approve) an email to a company, with Claude drafting and
 * attachments. Everything is autosaved as a draft, so closing the window
 * never loses it; reopening continues where you left off.
 */
export function EmailComposeDialog({ open, onOpenChange, company, people, gmailAddress, draft, onDone }: EmailComposeDialogProps) {
  const { refreshData } = useCRMContext();
  const recipients = people.filter((person) => person.email?.includes('@'));
  const [to, setTo] = useState('');
  const [recipientId, setRecipientId] = useState<string>(OTHER_RECIPIENT);
  const recipient = people.find((person) => person.id === recipientId) ?? null;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [instructions, setInstructions] = useState('');
  const [scheduleAt, setScheduleAt] = useState(toLocalInputValue(tomorrowAtNine()));
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [history, setHistory] = useState<DraftVersion[]>([]);
  const [uploading, setUploading] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  /** Rewrites that can be undone: the history entry they replaced and the text they produced. */
  const [undoStack, setUndoStack] = useState<{ savedAt: string; subject: string; body: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsBytes = attachments.reduce((total, attachment) => total + attachment.size, 0);

  // Draft persistence
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isSequenceDraft, setIsSequenceDraft] = useState(false);
  const [resumedAt, setResumedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const loadedRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const savePromise = useRef<Promise<string | null>>(Promise.resolve(null));
  const draftIdRef = useRef<string | null>(null);
  draftIdRef.current = draftId;

  const hasContent = subject.trim() !== '' || body.trim() !== '' || attachments.length > 0;

  const resetForm = (preferredRecipient = recipients[0]) => {
    setRecipientId(preferredRecipient?.id ?? OTHER_RECIPIENT);
    setTo(preferredRecipient?.email || company.email || '');
    setSubject('');
    setBody('');
    setAttachments([]);
    setAiDraft(null);
    setHistory([]);
    setInstructions('');
    setUndoStack([]);
    setDraftId(null);
    setIsSequenceDraft(false);
    setResumedAt(null);
    setSaveState('idle');
  };

  const loadDraft = (record: EmailRecord) => {
    const person = people.find((item) => item.id === record.contact_id);
    setRecipientId(person && person.email === record.to_email ? person.id : OTHER_RECIPIENT);
    setTo(record.to_email);
    setSubject(record.subject);
    setBody(record.body);
    setAttachments(record.attachments ?? []);
    setAiDraft(record.ai_draft);
    setHistory(record.draft_history ?? []);
    setInstructions(record.draft_instructions ?? '');
    setUndoStack([]);
    setDraftId(record.id);
    setIsSequenceDraft(Boolean(record.enrollment_id));
    setSaveState('saved');
  };

  // On open: the given draft, else the email you were writing for this company, else blank.
  useEffect(() => {
    if (!open) return;
    loadedRef.current = false;
    dirtyRef.current = false;
    setScheduleAt(toLocalInputValue(tomorrowAtNine()));
    if (draft) {
      loadDraft(draft);
      setResumedAt(null);
      loadedRef.current = true;
      return;
    }
    resetForm();
    setLoading(true);
    getOpenDraft(company.id)
      .then((existing) => {
        if (existing) {
          loadDraft(existing);
          setResumedAt(existing.created_at);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setLoading(false);
        loadedRef.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft?.id, company.id]);

  const persist = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirtyRef.current) return savePromise.current;
    dirtyRef.current = false;
    setSaveState('saving');
    const fields = {
      companyId: company.id,
      contactId: recipient?.id ?? null,
      to: to.trim(),
      subject,
      body,
      attachments,
      aiDraft,
      instructions,
      history,
    };
    // Chained so saves never overlap (the first one creates the row).
    savePromise.current = savePromise.current
      .catch(() => null)
      .then(() => saveDraft(draftIdRef.current, fields))
      .then((id) => {
        draftIdRef.current = id;
        setDraftId(id);
        setSaveState('saved');
        return id;
      })
      .catch((error) => {
        dirtyRef.current = true;
        setSaveState('error');
        console.error('Figtree: draft save failed', error);
        return draftIdRef.current;
      });
    return savePromise.current;
  }, [company.id, recipient?.id, to, subject, body, attachments, aiDraft, instructions, history]);

  // Autosave shortly after any change, once there is something worth keeping.
  useEffect(() => {
    if (!open || !loadedRef.current) return;
    if (!hasContent && !draftIdRef.current) return;
    dirtyRef.current = true;
    setSaveState('idle');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persist(), AUTOSAVE_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, recipientId, subject, body, attachments, instructions, history]);

  const close = async () => {
    if (sending) return;
    const pending = dirtyRef.current;
    await persist();
    onOpenChange(false);
    if ((pending || draftIdRef.current) && hasContent && !isSequenceDraft) {
      toast('Draft saved', { description: `Continue anytime from ${company.name}'s emails.` });
    }
    onDone?.();
  };

  const chooseRecipient = (id: string) => {
    setRecipientId(id);
    const person = people.find((item) => item.id === id);
    if (person) setTo(person.email);
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files);
    const addedBytes = selected.reduce((total, file) => total + file.size, 0);
    if (attachmentsBytes + addedBytes > MAX_ATTACHMENTS_BYTES) {
      toast.error('Attachments are too large', { description: 'Gmail allows 25 MB per email in total.' });
      return;
    }
    setUploading(true);
    try {
      const uploaded: EmailAttachment[] = [];
      for (const file of selected) {
        uploaded.push(await uploadAttachment(file));
      }
      setAttachments((current) => [...current, ...uploaded]);
    } catch (error) {
      toast.error('Upload failed', { description: errorMessage(error) });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (attachment: EmailAttachment) => {
    setAttachments((current) => current.filter((item) => item.path !== attachment.path));
    removeAttachment(attachment).catch(() => undefined);
  };

  /** Keeps the current text as an earlier version before it gets replaced. */
  const pushCurrentToHistory = (current: DraftVersion[]) =>
    subject.trim() || body.trim()
      ? [{ subject, body, instructions, saved_at: new Date().toISOString() }, ...current].slice(0, MAX_DRAFT_VERSIONS)
      : current;

  const handleDraft = async () => {
    setDrafting(true);
    try {
      const result = await draftEmail(company.id, recipient?.id ?? null, instructions);
      setHistory((current) => pushCurrentToHistory(current));
      setSubject(result.subject);
      setBody(result.body);
      setAiDraft(result.body);
      if (result.attachments?.length) {
        setAttachments((current) => [
          ...current,
          ...result.attachments.filter((file) => !current.some((item) => item.path === file.path)),
        ]);
        toast('Claude suggested attachments', { description: result.attachments.map((file) => file.filename).join(', ') });
      }
    } catch (error) {
      toast.error('Drafting failed', { description: errorMessage(error) });
    } finally {
      setDrafting(false);
    }
  };

  const applyRewrite = (result: { subject: string; body: string }) => {
    const savedAt = new Date().toISOString();
    setHistory((current) =>
      [{ subject, body, instructions, saved_at: savedAt }, ...current].slice(0, MAX_DRAFT_VERSIONS),
    );
    setSubject(result.subject);
    setBody(result.body);
    setUndoStack((current) => [...current, { savedAt, subject: result.subject, body: result.body }]);
  };

  // Undo only while the text is still exactly what the last rewrite produced.
  const lastRewrite = undoStack[undoStack.length - 1];
  const canUndo = Boolean(lastRewrite && lastRewrite.subject === subject && lastRewrite.body === body);

  const undoRewrite = () => {
    if (!lastRewrite) return;
    const version = history.find((item) => item.saved_at === lastRewrite.savedAt);
    setUndoStack((current) => current.slice(0, -1));
    if (!version) return;
    setHistory((current) => current.filter((item) => item !== version));
    setSubject(version.subject);
    setBody(version.body);
  };

  const restoreVersion = (index: number) => {
    const version = history[index];
    if (!version) return;
    setHistory((current) => pushCurrentToHistory(current.filter((_, i) => i !== index)));
    setSubject(version.subject);
    setBody(version.body);
  };

  const handleDiscard = async (keepOpen: boolean) => {
    if (hasContent && !window.confirm('Discard this draft? This can’t be undone.')) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    dirtyRef.current = false;
    const id = await savePromise.current.catch(() => draftIdRef.current);
    try {
      if (id ?? draftIdRef.current) await discardDraft({ id: (id ?? draftIdRef.current)!, attachments });
    } catch (error) {
      toast.error('Could not discard', { description: errorMessage(error) });
      return;
    }
    resetForm();
    onDone?.();
    if (!keepOpen) onOpenChange(false);
  };

  const canSend =
    to.trim().includes('@') && subject.trim() !== '' && body.trim() !== '' && !sending && !uploading && !rewriting;

  const handleSend = async (when: 'now' | 'scheduled') => {
    const scheduledFor = when === 'now' ? new Date() : new Date(scheduleAt);
    if (when === 'scheduled' && (Number.isNaN(scheduledFor.getTime()) || scheduledFor <= new Date())) {
      toast.error('Pick a time in the future to schedule.');
      return;
    }
    setSending(true);
    try {
      // Every email goes out from its saved draft row.
      dirtyRef.current = true;
      const id = await persist();
      if (!id) throw new Error('Could not save the draft before sending.');
      await approveDraft(id, {
        to: to.trim(),
        contactId: recipient?.id ?? draft?.contact_id ?? null,
        subject,
        body,
        attachments,
        scheduledFor,
      });
      if (when === 'now') {
        await sendEmailNow(id);
        toast('Email sent', { description: `Logged on ${company.name}.` });
        refreshData();
      } else {
        toast('Email scheduled', { description: format(scheduledFor, "EEE d MMM 'at' HH:mm") });
      }
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error(when === 'now' ? 'Sending failed' : 'Scheduling failed', { description: errorMessage(error) });
    } finally {
      setSending(false);
      onDone?.();
    }
  };

  const handleSkip = async () => {
    if (!draftId) return;
    try {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      dirtyRef.current = false;
      await skipDraft(draftId);
      toast('Step skipped', { description: 'The sequence moves on to its next step.' });
      resetForm();
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      toast.error('Could not skip', { description: errorMessage(error) });
    }
  };

  const saveLabel =
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Draft saved' : saveState === 'error' ? 'Not saved — retrying' : '';

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isSequenceDraft ? 'Approve: ' : 'Email '}
            {recipient ? `${recipient.fullName} at ${company.name}` : company.name}
          </DialogTitle>
          <DialogDescription>
            {isSequenceDraft
              ? 'Drafted by a sequence. Edit as needed, then send or schedule. Skipping moves the sequence on.'
              : `Sent from ${gmailAddress ?? 'your Gmail'}. Replies are detected automatically.`}
          </DialogDescription>
        </DialogHeader>

        {resumedAt && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs flex items-center justify-between gap-2">
            <span>Continuing your draft from {formatDistanceToNow(new Date(resumedAt), { addSuffix: true })}.</span>
            <button className="underline underline-offset-2 hover:text-foreground" onClick={() => handleDiscard(true)}>
              Start over
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3 space-y-2">
              <Label htmlFor="draft-instructions" className="text-sm">
                {body ? 'Redraft with Claude' : 'Draft with Claude'}
              </Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="draft-instructions"
                  placeholder="Optional: e.g. follow up on the pilot offer, propose a call next week"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !drafting) handleDraft();
                  }}
                />
                <Button variant="outline" onClick={handleDraft} disabled={drafting || rewriting}>
                  {drafting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  {drafting ? 'Drafting…' : body ? 'Redraft' : 'Draft'}
                </Button>
              </div>
              {history.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
                    <History className="h-3 w-3" /> Earlier versions ({history.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {history.map((version, index) => (
                      <button
                        key={`${version.saved_at}-${index}`}
                        onClick={() => restoreVersion(index)}
                        className="w-full text-left rounded-md border border-border px-2 py-1.5 hover:bg-muted/50"
                      >
                        <span className="font-medium">{version.subject || '(no subject)'}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {formatDistanceToNow(new Date(version.saved_at), { addSuffix: true })}
                          {version.instructions ? ` · "${version.instructions}"` : ''}
                        </span>
                        <span className="block text-muted-foreground truncate">{version.body}</span>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email-to">To</Label>
              {recipients.length > 0 && (
                <Select value={recipientId} onValueChange={chooseRecipient}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {recipients.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.fullName}
                        {person.role ? ` (${person.role})` : ''}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER_RECIPIENT}>Other address…</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Input
                id="email-to"
                type="email"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  if (recipient && event.target.value !== recipient.email) setRecipientId(OTHER_RECIPIENT);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input id="email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email-body">Message</Label>
              <Textarea
                id="email-body"
                rows={10}
                value={body}
                readOnly={rewriting}
                className={rewriting ? 'opacity-60' : undefined}
                onChange={(event) => setBody(event.target.value)}
              />
              <p className="text-xs text-muted-foreground flex justify-between gap-2">
                <span>Your Gmail signature is added automatically when sending.</span>
                <span>{saveLabel}</span>
              </p>
              <EmailRewriteBar
                subject={subject}
                body={body}
                disabled={drafting || sending}
                onRewritingChange={setRewriting}
                onApply={applyRewrite}
                canUndo={canUndo}
                onUndo={undoRewrite}
              />
            </div>

            <div className="space-y-2">
              {attachments.map((attachment) => (
                <div key={attachment.path} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{attachment.filename}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(attachment.size)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    aria-label={`Remove ${attachment.filename}`}
                    onClick={() => handleRemoveAttachment(attachment)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => handleFilesSelected(event.target.files)}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading || sending}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Paperclip className="h-4 w-4 mr-2" />}
                {uploading ? 'Uploading…' : 'Attach files'}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="email-schedule" className="text-xs text-muted-foreground">
                Schedule for
              </Label>
              <Input
                id="email-schedule"
                type="datetime-local"
                value={scheduleAt}
                onChange={(event) => setScheduleAt(event.target.value)}
                className="w-52"
              />
            </div>
            <Button variant="outline" onClick={() => handleSend('scheduled')} disabled={!canSend}>
              Schedule
            </Button>
          </div>
          <div className="flex gap-2">
            {isSequenceDraft ? (
              <Button variant="ghost" onClick={handleSkip} disabled={sending}>
                <SkipForward className="h-4 w-4 mr-2" />
                Skip step
              </Button>
            ) : (
              (draftId || hasContent) && (
                <Button variant="ghost" onClick={() => handleDiscard(false)} disabled={sending}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Discard
                </Button>
              )
            )}
            <Button onClick={() => handleSend('now')} disabled={!canSend}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send now
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompanyEmails({ company, people }: { company: Company; people: Contact[] }) {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [gmail, setGmail] = useState<{ email: string } | null | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftToApprove, setDraftToApprove] = useState<EmailRecord | null>(null);

  const loadEmails = useCallback(() => {
    listCompanyEmails(company.id)
      .then(setEmails)
      .catch((error) => toast.error('Could not load emails', { description: errorMessage(error) }));
  }, [company.id]);

  useEffect(() => {
    loadEmails();
    getGmailAccount()
      .then(setGmail)
      .catch(() => setGmail(null));
  }, [loadEmails]);

  const handleCancel = async (emailId: string) => {
    try {
      await cancelEmail(emailId);
      loadEmails();
    } catch (error) {
      toast.error('Could not cancel', { description: errorMessage(error) });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between lg:p-6">
        <CardTitle className="text-lg lg:text-xl">Emails</CardTitle>
        {gmail && (
          <Button
            size="sm"
            onClick={() => {
              setDraftToApprove(null);
              setComposeOpen(true);
            }}
          >
            <Mail className="h-4 w-4 mr-2" />
            Write email
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 lg:px-6 lg:pb-6">
        {gmail === null && (
          <p className="text-sm text-muted-foreground">
            <Link to="/settings" className="underline underline-offset-2 hover:text-foreground">
              Connect Gmail in Settings
            </Link>{' '}
            to send, schedule and draft emails from here.
          </p>
        )}
        {gmail && emails.length === 0 && <p className="text-sm text-muted-foreground text-center py-2">No emails yet.</p>}
        {emails.map((email) => (
          <div key={email.id} className="rounded-lg border border-border p-3">
            <button className="w-full text-left" onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground truncate">{email.subject || '(no subject)'}</p>
                {statusBadge(email)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{statusDetail(email)}</p>
            </button>
            {expandedId === email.id && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">To: {email.to_email}</p>
                <p className="text-sm whitespace-pre-wrap text-foreground">{email.body}</p>
                {email.attachments?.length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    {email.attachments.map((attachment) => attachment.filename).join(', ')}
                  </p>
                )}
              </div>
            )}
            {email.status === 'draft' && (
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    setDraftToApprove(email);
                    setComposeOpen(true);
                  }}
                >
                  {email.enrollment_id ? 'Review & send' : 'Continue'}
                </Button>
              </div>
            )}
            {email.status === 'scheduled' && (
              <div className="mt-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => handleCancel(email.id)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <EmailComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        company={company}
        people={people}
        gmailAddress={gmail?.email}
        draft={draftToApprove}
        onDone={loadEmails}
      />
    </Card>
  );
}
