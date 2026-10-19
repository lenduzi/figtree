import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, formatDistanceToNow, setHours, setMinutes, startOfDay } from 'date-fns';
import { Loader2, Mail, Send, Sparkles } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  cancelEmail,
  draftEmail,
  getGmailAccount,
  listContactEmails,
  queueEmail,
  sendEmailNow,
  type EmailRecord,
} from '@/lib/gmail';
import type { Contact } from '@/types/crm';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const toLocalInputValue = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");
const tomorrowAtNine = () => setMinutes(setHours(startOfDay(addDays(new Date(), 1)), 9), 0);

const statusBadge = (email: EmailRecord) => {
  if (email.replied_at) return <Badge>Replied</Badge>;
  switch (email.status) {
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
  if (email.status === 'scheduled') return `Sends ${format(new Date(email.scheduled_for), 'EEE d MMM, HH:mm')}`;
  if (email.status === 'sent' && email.sent_at) {
    return `Sent ${formatDistanceToNow(new Date(email.sent_at), { addSuffix: true })} · no reply yet`;
  }
  return email.error ?? '';
};

export function ContactEmails({ contact }: { contact: Contact }) {
  const { refreshData } = useCRMContext();
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [gmail, setGmail] = useState<{ email: string } | null | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [instructions, setInstructions] = useState('');
  const [scheduleAt, setScheduleAt] = useState(toLocalInputValue(tomorrowAtNine()));
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  const loadEmails = useCallback(() => {
    listContactEmails(contact.id)
      .then(setEmails)
      .catch((error) => toast.error('Could not load emails', { description: errorMessage(error) }));
  }, [contact.id]);

  useEffect(() => {
    loadEmails();
    getGmailAccount()
      .then(setGmail)
      .catch(() => setGmail(null));
  }, [loadEmails]);

  const openCompose = () => {
    setTo(contact.email || '');
    setSubject('');
    setBody('');
    setInstructions('');
    setScheduleAt(toLocalInputValue(tomorrowAtNine()));
    setComposeOpen(true);
  };

  const handleDraft = async () => {
    setDrafting(true);
    try {
      const draft = await draftEmail(contact.id, instructions);
      setSubject(draft.subject);
      setBody(draft.body);
    } catch (error) {
      toast.error('Drafting failed', { description: errorMessage(error) });
    } finally {
      setDrafting(false);
    }
  };

  const canSend = to.trim().includes('@') && subject.trim() !== '' && body.trim() !== '' && !sending;

  const handleSend = async (when: 'now' | 'scheduled') => {
    const scheduledFor = when === 'now' ? new Date() : new Date(scheduleAt);
    if (when === 'scheduled' && (Number.isNaN(scheduledFor.getTime()) || scheduledFor <= new Date())) {
      toast.error('Pick a time in the future to schedule.');
      return;
    }
    setSending(true);
    try {
      const id = await queueEmail({ contactId: contact.id, to: to.trim(), subject, body, scheduledFor });
      if (when === 'now') {
        await sendEmailNow(id);
        toast('Email sent', { description: `Logged on ${contact.fullName}.` });
        refreshData();
      } else {
        toast('Email scheduled', { description: format(scheduledFor, "EEE d MMM 'at' HH:mm") });
      }
      setComposeOpen(false);
    } catch (error) {
      toast.error(when === 'now' ? 'Sending failed' : 'Scheduling failed', { description: errorMessage(error) });
    } finally {
      setSending(false);
      loadEmails();
    }
  };

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
          <Button size="sm" onClick={openCompose}>
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
        {gmail && emails.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">No emails yet.</p>
        )}
        {emails.map((email) => (
          <div key={email.id} className="rounded-lg border border-border p-3">
            <button
              className="w-full text-left"
              onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
            >
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

      <Dialog open={composeOpen} onOpenChange={(open) => !sending && setComposeOpen(open)}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email {contact.fullName}</DialogTitle>
            <DialogDescription>Sent from {gmail?.email}. Replies are detected automatically.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3 space-y-2">
              <Label htmlFor="draft-instructions" className="text-sm">
                Draft with Claude
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
              <Input id="email-to" type="email" value={to} onChange={(event) => setTo(event.target.value)} />
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
                onChange={(event) => setBody(event.target.value)}
              />
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
            <Button onClick={() => handleSend('now')} disabled={!canSend}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
