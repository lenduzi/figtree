import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import figtreeLogo from '@/assets/figtree-logo.png';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Activity, Contact, DEFAULT_STAGES, ResearchEntry, ResearchList, Stage, Task } from '@/types/crm';
import { useNavigate } from 'react-router-dom';
import { AppTheme, useAppTheme } from '@/contexts/AppThemeContext';

const STORAGE_KEYS = {
  contacts: 'simplecrm_contacts',
  tasks: 'simplecrm_tasks',
  stages: 'simplecrm_stages',
  activities: 'simplecrm_activities',
  researchLists: 'simplecrm_research_lists',
  researchEntries: 'simplecrm_research_entries',
};
const FEEDBACK_EMAIL = 'lennhahn@gmail.com';
const FEEDBACK_ENDPOINT = `https://formsubmit.co/ajax/${FEEDBACK_EMAIL}`;

type CRMBackup = {
  schemaVersion: number;
  exportedAt: string;
  app: string;
  data: {
    contacts: Contact[];
    tasks: Task[];
    activities: Activity[];
    researchEntries: ResearchEntry[];
    settings?: {
      stages?: Stage[];
      researchLists?: ResearchList[];
    };
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const validateBackup = (value: unknown): { ok: true; data: CRMBackup } | { ok: false; error: string } => {
  if (!isRecord(value)) {
    return { ok: false, error: 'Backup file is not a valid JSON object.' };
  }

  if (value.schemaVersion !== 1) {
    return { ok: false, error: 'Unsupported backup version.' };
  }

  if (value.app !== 'solo-crm') {
    return { ok: false, error: 'This backup file is not for this app.' };
  }

  if (typeof value.exportedAt !== 'string') {
    return { ok: false, error: 'Backup metadata is missing or invalid.' };
  }

  if (!isRecord(value.data)) {
    return { ok: false, error: 'Backup data section is missing.' };
  }

  const data = value.data as Record<string, unknown>;

  if (!Array.isArray(data.contacts)) {
    return { ok: false, error: 'Contacts data is missing or invalid.' };
  }
  if (!Array.isArray(data.tasks)) {
    return { ok: false, error: 'Tasks data is missing or invalid.' };
  }
  if (!Array.isArray(data.activities)) {
    return { ok: false, error: 'Activities data is missing or invalid.' };
  }
  if (!Array.isArray(data.researchEntries)) {
    return { ok: false, error: 'Research entries data is missing or invalid.' };
  }

  if (data.settings !== undefined) {
    if (!isRecord(data.settings)) {
      return { ok: false, error: 'Settings data is invalid.' };
    }
    const settings = data.settings as Record<string, unknown>;
    if (settings.stages !== undefined && !Array.isArray(settings.stages)) {
      return { ok: false, error: 'Stages data is invalid.' };
    }
    if (settings.researchLists !== undefined && !Array.isArray(settings.researchLists)) {
      return { ok: false, error: 'Research lists data is invalid.' };
    }
  }

  return { ok: true, data: value as CRMBackup };
};

export default function Settings() {
  const navigate = useNavigate();
  const { appTheme, setAppTheme } = useAppTheme();
  const {
    stages,
    contacts,
    tasks,
    activities,
    researchEntries,
    researchLists,
  } = useCRMContext();
  const [dataOpen, setDataOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<CRMBackup | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackContact, setFeedbackContact] = useState('');
  const [feedbackName, setFeedbackName] = useState('');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const feedbackBody = useMemo(() => {
    const lines = [];
    if (feedbackMessage.trim()) {
      lines.push(`Feedback: ${feedbackMessage.trim()}`);
    }
    if (feedbackName.trim()) {
      lines.push(`Name: ${feedbackName.trim()}`);
    }
    if (feedbackContact.trim()) {
      lines.push(`Contact: ${feedbackContact.trim()}`);
    }
    return lines.join('\n');
  }, [feedbackContact, feedbackMessage, feedbackName]);

  const feedbackMailto = useMemo(() => {
    const subject = encodeURIComponent('Figtree feedback');
    const body = encodeURIComponent(
      feedbackBody || 'Feedback: (write your request here)\nContact: (optional)',
    );
    return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  }, [feedbackBody]);

  const handleSendFeedback = async () => {
    if (!feedbackMessage.trim() || sendStatus === 'sending') return;
    setSendStatus('sending');
    try {
      const formData = new FormData();
      formData.append('message', feedbackMessage.trim());
      if (feedbackName.trim()) formData.append('name', feedbackName.trim());
      if (feedbackContact.trim()) formData.append('contact', feedbackContact.trim());
      formData.append('source', 'figtree-settings');

      const response = await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Feedback request failed');
      }
      setSendStatus('sent');
      setFeedbackMessage('');
      setFeedbackName('');
      setFeedbackContact('');
    } catch {
      setSendStatus('failed');
    }
  };

  useEffect(() => {
    if (sendStatus !== 'sent') return;
    const timer = window.setTimeout(() => {
      setSendStatus('idle');
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [sendStatus]);

  const handleExport = () => {
    const backup: CRMBackup = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: 'solo-crm',
      data: {
        contacts,
        tasks,
        activities,
        researchEntries,
        settings: {
          stages,
          researchLists,
        },
      },
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `crm-backup-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = validateBackup(parsed);
      if (!validation.ok) {
        toast.error(validation.error);
        return;
      }
      setPendingImport(validation.data);
      setConfirmOpen(true);
    } catch {
      toast.error('Unable to read that file. Please choose a valid JSON backup.');
    }
  };

  const applyImport = () => {
    if (!pendingImport) return;
    const settings = pendingImport.data.settings ?? {};
    const stagesToUse = settings.stages ?? DEFAULT_STAGES;
    const researchListsToUse = settings.researchLists ?? [];

    try {
      localStorage.setItem(STORAGE_KEYS.contacts, JSON.stringify(pendingImport.data.contacts));
      localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(pendingImport.data.tasks));
      localStorage.setItem(STORAGE_KEYS.activities, JSON.stringify(pendingImport.data.activities));
      localStorage.setItem(STORAGE_KEYS.researchEntries, JSON.stringify(pendingImport.data.researchEntries));
      localStorage.setItem(STORAGE_KEYS.stages, JSON.stringify(stagesToUse));
      localStorage.setItem(STORAGE_KEYS.researchLists, JSON.stringify(researchListsToUse));
      setConfirmOpen(false);
      setPendingImport(null);
      window.location.reload();
    } catch {
      toast.error('Import failed. Please try again with a valid backup file.');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="sr-only sm:not-sr-only text-3xl font-bold text-foreground">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <img src={figtreeLogo} alt="Figtree logo" className="h-9 w-9" />
            <div>
              <CardTitle>About Figtree</CardTitle>
              <CardDescription>Your lightweight CRM for staying on top of follow-ups.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>A lightweight personal CRM to manage contacts, track stages, and never miss a follow-up.</p>
          <p className="mt-2">All data is stored locally in your browser.</p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <Button disabled>
              Sign up
            </Button>
            <span className="text-xs text-muted-foreground self-center">Coming soon</span>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how the app looks on this device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <p className="text-sm font-medium text-foreground">Theme</p>
            <Select value={appTheme} onValueChange={(value) => setAppTheme(value as AppTheme)}>
              <SelectTrigger className="w-full sm:max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Figtree (Light/Dark)</SelectItem>
                <SelectItem value="apple">Appletree (Light/Dark)</SelectItem>
                <SelectItem value="solarized">Sandstorm (Solarized Light/Dark)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Appletree and Sandstorm are app-only. Use the top-right toggle to switch light/dark within the selected theme.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Learn more</CardTitle>
          <CardDescription>See how Figtree works, pricing, and privacy.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate('/marketing')} className="w-full">
            Visit marketing page
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Send feedback</CardTitle>
          <CardDescription>Share ideas, bugs, and feature requests. We read every note.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button onClick={() => setFeedbackOpen(true)} className="w-full sm:w-auto">
            <MessageCircle className="h-4 w-4" />
            Open feedback form
          </Button>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <a href={feedbackMailto}>Email instead</a>
          </Button>
        </CardContent>
      </Card>

      <Collapsible open={dataOpen} onOpenChange={setDataOpen}>
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Data (Advanced)</CardTitle>
              <CardDescription>Export or restore your local CRM data.</CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ChevronDown className={`h-4 w-4 transition-transform ${dataOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  Export Backup
                </Button>
                <Button variant="outline" size="sm" onClick={handleImportClick}>
                  Import Backup
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace local data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current local data. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingImport(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyImport}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Tell us what would make Figtree better. Feature requests and bugs are both welcome.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="settings-feedback-message">Message</Label>
              <Textarea
                id="settings-feedback-message"
                value={feedbackMessage}
                onChange={(event) => setFeedbackMessage(event.target.value)}
                placeholder="What should we improve or fix?"
                className="min-h-[140px]"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="settings-feedback-name" className="text-xs text-muted-foreground">
                  Name (optional)
                </Label>
                <Input
                  id="settings-feedback-name"
                  value={feedbackName}
                  onChange={(event) => setFeedbackName(event.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="settings-feedback-contact" className="text-xs text-muted-foreground">
                  Reply email (optional)
                </Label>
                <Input
                  id="settings-feedback-contact"
                  value={feedbackContact}
                  onChange={(event) => setFeedbackContact(event.target.value)}
                  placeholder="Email or phone"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSendFeedback} disabled={!feedbackMessage.trim() || sendStatus === 'sending'}>
              {sendStatus === 'sending' ? 'Sending...' : 'Send feedback'}
            </Button>
          </DialogFooter>
          {sendStatus === 'sent' && (
            <p className="text-xs text-muted-foreground">Sent — thank you for the feedback.</p>
          )}
          {sendStatus === 'failed' && (
            <p className="text-xs text-muted-foreground">Couldn’t send right now. Try again in a moment.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
