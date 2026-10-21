import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, formatDistanceToNow, setHours, setMinutes, startOfDay } from 'date-fns';
import { Loader2, Mail, Paperclip, Send, SkipForward, Sparkles, X } from 'lucide-react';
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
import {
  approveDraft,
  cancelEmail,
  draftEmail,
  formatFileSize,
  getGmailAccount,
  listCompanyEmails,
  MAX_ATTACHMENTS_BYTES,
  queueEmail,
  removeAttachment,
  sendEmailNow,
  skipDraft,
  uploadAttachment,
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
      return <Badge variant="outline">To approve</Badge>;
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
  if (email.status === 'draft') return 'Drafted by a sequence, waiting for you in Today';
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
  /** A sequence draft to review and approve instead of a new email. */
  draft?: EmailRecord | null;
  /** Called after an email was sent, scheduled or skipped. */
  onDone?: () => void;
};

/** Compose (or approve) an email to a company, with Claude drafting and attachments. */
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsBytes = attachments.reduce((total, attachment) => total + attachment.size, 0);

  // Reset the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (draft) {
      const person = people.find((item) => item.id === draft.contact_id);
      setRecipientId(person?.email === draft.to_email ? person.id : OTHER_RECIPIENT);
      setTo(draft.to_email);
      setSubject(draft.subject);
      setBody(draft.body);
      setAttachments(draft.attachments ?? []);
      setAiDraft(draft.ai_draft);
    } else {
      const preferred = recipients[0];
      setRecipientId(preferred?.id ?? OTHER_RECIPIENT);
      setTo(preferred?.email || company.email || '');
      setSubject('');
      setBody('');
      setAttachments([]);
      setAiDraft(null);
    }
    setInstructions('');
    setScheduleAt(toLocalInputValue(tomorrowAtNine()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft?.id]);

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

  const handleDraft = async () => {
    setDrafting(true);
    try {
      const result = await draftEmail(company.id, recipient?.id ?? null, instructions);
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

  const canSend = to.trim().includes('@') && subject.trim() !== '' && body.trim() !== '' && !sending && !uploading;

  const handleSend = async (when: 'now' | 'scheduled') => {
    const scheduledFor = when === 'now' ? new Date() : new Date(scheduleAt);
    if (when === 'scheduled' && (Number.isNaN(scheduledFor.getTime()) || scheduledFor <= new Date())) {
      toast.error('Pick a time in the future to schedule.');
      return;
    }
    setSending(true);
    try {
      let id: string;
      if (draft) {
        await approveDraft(draft.id, {
          to: to.trim(),
          contactId: recipient?.id ?? draft.contact_id,
          subject,
          body,
          attachments,
          scheduledFor,
        });
        id = draft.id;
      } else {
        id = await queueEmail({
          companyId: company.id,
          contactId: recipient?.id ?? null,
          to: to.trim(),
          subject,
          body,
          scheduledFor,
          attachments,
          aiDraft,
        });
      }
      if (when === 'now') {
        await sendEmailNow(id);
        toast('Email sent', { description: `Logged on ${company.name}.` });
        refreshData();
      } else {
        toast('Email scheduled', { description: format(scheduledFor, "EEE d MMM 'at' HH:mm") });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(when === 'now' ? 'Sending failed' : 'Scheduling failed', { description: errorMessage(error) });
    } finally {
      setSending(false);
      onDone?.();
    }
  };

  const handleSkip = async () => {
    if (!draft) return;
    try {
      await skipDraft(draft.id);
      toast('Step skipped', { description: 'The sequence moves on to its next step.' });
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      toast.error('Could not skip', { description: errorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft ? 'Approve: ' : 'Email '}
            {recipient ? `${recipient.fullName} at ${company.name}` : company.name}
          </DialogTitle>
          <DialogDescription>
            {draft
              ? 'Drafted by a sequence. Edit as needed, then send or schedule. Skipping moves the sequence on.'
              : `Sent from ${gmailAddress ?? 'your Gmail'}. Replies are detected automatically.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <Label htmlFor="draft-instructions" className="text-sm">
              {draft ? 'Redraft with Claude' : 'Draft with Claude'}
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
              <Button variant="outline" onClick={handleDraft} disabled={drafting}>
                {drafting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {drafting ? 'Drafting…' : body ? 'Redraft' : 'Draft'}
              </Button>
            </div>
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
            <Textarea id="email-body" rows={10} value={body} onChange={(event) => setBody(event.target.value)} />
            <p className="text-xs text-muted-foreground">Your Gmail signature is added automatically when sending.</p>
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
            {draft && (
              <Button variant="ghost" onClick={handleSkip} disabled={sending}>
                <SkipForward className="h-4 w-4 mr-2" />
                Skip step
              </Button>
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
                  Review & send
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
