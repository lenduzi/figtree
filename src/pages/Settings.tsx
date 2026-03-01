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
import { useNavigate } from 'react-router-dom';
import { AppTheme, useAppTheme } from '@/contexts/AppThemeContext';
import type { Session } from '@supabase/supabase-js';
import {
  applyBackup,
  buildBackup,
  CLOUD_BACKUP_TABLE,
  CLOUD_LAST_PULL_KEY,
  CLOUD_LAST_SYNC_KEY,
  CLOUD_SYNC_ENABLED_KEY,
  type CRMBackup,
  validateBackup,
} from '@/lib/backup';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
const FEEDBACK_EMAIL = 'lennhahn@gmail.com';
const FEEDBACK_ENDPOINT = `https://formsubmit.co/ajax/${FEEDBACK_EMAIL}`;

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
    eisenhowerItems,
    projects,
    projectVisits,
    creators,
  } = useCRMContext();
  const [dataOpen, setDataOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<CRMBackup | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearOutreachOpen, setClearOutreachOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackContact, setFeedbackContact] = useState('');
  const [feedbackName, setFeedbackName] = useState('');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [authEmail, setAuthEmail] = useState('');
  const [authStatus, setAuthStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'error'>('idle');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'restoring' | 'restored' | 'failed'>('idle');
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLOUD_LAST_SYNC_KEY);
    } catch {
      return null;
    }
  });
  const [lastPullAt, setLastPullAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLOUD_LAST_PULL_KEY);
    } catch {
      return null;
    }
  });

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

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    setAuthStatus('idle');
    setAuthError(null);
    setAuthEmail('');
    setAuthCode('');
  }, [session]);

  useEffect(() => {
    if (!supabase || !session) {
      setCloudUpdatedAt(null);
      return;
    }
    let isMounted = true;
    const fetchMeta = async () => {
      const { data, error } = await supabase
        .from(CLOUD_BACKUP_TABLE)
        .select('updated_at')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!isMounted || error) return;
      setCloudUpdatedAt(data?.updated_at ?? null);
    };
    fetchMeta();
    return () => {
      isMounted = false;
    };
  }, [session]);

  const handleSendCode = async () => {
    if (!supabase || !isSupabaseConfigured) {
      toast.error('Supabase is not configured yet.');
      return;
    }
    const trimmedEmail = authEmail.trim();
    if (!trimmedEmail || authStatus === 'sending' || authStatus === 'verifying') return;
    setAuthStatus('sending');
    setAuthError(null);
    setAuthCode('');
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
    });
    if (error) {
      setAuthStatus('error');
      setAuthError(error.message);
      toast.error('Code request failed', { description: error.message });
      return;
    }
    setAuthStatus('sent');
    toast('Code sent', { description: 'Check your email for the 6-digit code.' });
  };

  const handleVerifyCode = async () => {
    if (!supabase || !isSupabaseConfigured) {
      toast.error('Supabase is not configured yet.');
      return;
    }
    const trimmedEmail = authEmail.trim();
    const trimmedCode = authCode.trim();
    if (!trimmedEmail || !trimmedCode || authStatus === 'verifying') return;
    setAuthStatus('verifying');
    setAuthError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: trimmedCode,
      type: 'email',
    });
    if (error) {
      setAuthStatus('error');
      setAuthError(error.message);
      toast.error('Code verification failed', { description: error.message });
      return;
    }
    setAuthStatus('idle');
    setAuthCode('');
    toast('Signed in');
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthStatus('idle');
    setAuthError(null);
    try {
      localStorage.removeItem(CLOUD_SYNC_ENABLED_KEY);
      localStorage.removeItem(CLOUD_LAST_SYNC_KEY);
      localStorage.removeItem(CLOUD_LAST_PULL_KEY);
    } catch {
      // ignore storage errors
    }
    setLastSyncAt(null);
    setLastPullAt(null);
    toast('Signed out');
  };

  const handleUploadBackup = async () => {
    if (!supabase || !session) return;
    setSyncStatus('syncing');
    const backup = buildBackup({
      contacts,
      tasks,
      activities,
      researchEntries,
      stages,
      researchLists,
      eisenhowerItems,
      projects,
      projectVisits,
      creators,
    });
    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from(CLOUD_BACKUP_TABLE)
      .upsert(
        {
          user_id: session.user.id,
          backup,
          updated_at: updatedAt,
        },
        { onConflict: 'user_id' },
      );
    if (error) {
      setSyncStatus('failed');
      toast.error('Cloud sync failed', { description: error.message });
      return;
    }
    setSyncStatus('synced');
    setCloudUpdatedAt(updatedAt);
    setLastSyncAt(updatedAt);
    try {
      localStorage.setItem(CLOUD_SYNC_ENABLED_KEY, '1');
      localStorage.setItem(CLOUD_LAST_SYNC_KEY, updatedAt);
    } catch {
      // ignore storage errors
    }
  };

  const handleRestoreFromCloud = async () => {
    if (!supabase || !session) return;
    setSyncStatus('restoring');
    const { data, error } = await supabase
      .from(CLOUD_BACKUP_TABLE)
      .select('backup, updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) {
      setSyncStatus('failed');
      toast.error('Cloud restore failed', { description: error.message });
      return;
    }
    if (!data?.backup) {
      setSyncStatus('idle');
      toast('No cloud backup found yet.');
      return;
    }
    const validation = validateBackup(data.backup);
    if (!validation.ok) {
      setSyncStatus('failed');
      toast.error(validation.error);
      return;
    }
    const result = applyBackup(validation.data);
    if (!result.ok) {
      setSyncStatus('failed');
      toast.error(result.error);
      return;
    }
    const pulledAt = new Date().toISOString();
    setLastPullAt(pulledAt);
    try {
      localStorage.setItem(CLOUD_SYNC_ENABLED_KEY, '1');
      localStorage.setItem(CLOUD_LAST_PULL_KEY, pulledAt);
    } catch {
      // ignore storage errors
    }
    setSyncStatus('restored');
    window.location.reload();
  };

  const handleExport = () => {
    const backup = buildBackup({
      contacts,
      tasks,
      activities,
      researchEntries,
      stages,
      researchLists,
      eisenhowerItems,
      projects,
      projectVisits,
      creators,
    });
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

  const handleClearOutreach = () => {
    try {
      localStorage.removeItem('simplecrm_outreach_leads_v1');
      localStorage.removeItem('simplecrm_outreach_actions_v1');
      localStorage.removeItem('simplecrm_outreach_imports_v1');
      toast('Outreach data cleared', {
        description: 'You can re-import your CSV now.',
      });
    } catch {
      toast('Unable to clear outreach data');
    }
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
    const result = applyBackup(pendingImport);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setConfirmOpen(false);
    setPendingImport(null);
    window.location.reload();
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
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Sign in to sync your data across devices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSupabaseConfigured && (
            <p className="text-sm text-muted-foreground">
              Supabase is not configured. Add your Supabase URL and anon key to enable sign-in.
            </p>
          )}
          {isSupabaseConfigured && !session && (
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="settings-auth-email">Email</Label>
                <Input
                  id="settings-auth-email"
                  type="email"
                  placeholder="you@company.com"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={handleSendCode}
                  disabled={!authEmail.trim() || authStatus === 'sending' || authStatus === 'verifying'}
                >
                  {authStatus === 'sending' ? 'Sending...' : 'Send code'}
                </Button>
              </div>
              {authStatus === 'sent' && (
                <p className="text-xs text-muted-foreground">Code sent. Check your inbox for the 6-digit code.</p>
              )}
              {(authStatus === 'sent' || authCode.trim()) && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="settings-auth-code">Code</Label>
                    <Input
                      id="settings-auth-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={authCode}
                      onChange={(event) => setAuthCode(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={handleVerifyCode}
                      disabled={!authEmail.trim() || !authCode.trim() || authStatus === 'verifying'}
                    >
                      {authStatus === 'verifying' ? 'Verifying...' : 'Verify code'}
                    </Button>
                  </div>
                </>
              )}
              {authStatus === 'error' && authError && (
                <p className="text-xs text-destructive">{authError}</p>
              )}
            </div>
          )}
          {isSupabaseConfigured && session && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Signed in</p>
                  <p className="text-xs text-muted-foreground">
                    {session.user.email ?? session.user.phone ?? 'Account'}
                  </p>
                </div>
                <Button variant="outline" onClick={handleSignOut}>
                  Sign out
                </Button>
              </div>
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Cloud sync</p>
                    <p className="text-xs text-muted-foreground">
                      Latest cloud backup: {cloudUpdatedAt ? new Date(cloudUpdatedAt).toLocaleString() : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last upload: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : '—'} · Last restore:{' '}
                      {lastPullAt ? new Date(lastPullAt).toLocaleString() : '—'}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      onClick={handleUploadBackup}
                      disabled={syncStatus === 'syncing' || syncStatus === 'restoring'}
                    >
                      {syncStatus === 'syncing' ? 'Syncing...' : 'Sync to cloud'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setRestoreConfirmOpen(true)}
                      disabled={syncStatus === 'syncing' || syncStatus === 'restoring'}
                    >
                      Restore from cloud
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sync runs in the background after your first upload or restore. Use restore when setting up a new device.
                </p>
              </div>
            </div>
          )}
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
                <Button variant="destructive" size="sm" onClick={() => setClearOutreachOpen(true)}>
                  Clear Outreach Data
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

      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from cloud backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current local data with the latest cloud backup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRestoreConfirmOpen(false);
                handleRestoreFromCloud();
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOutreachOpen} onOpenChange={setClearOutreachOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear outreach data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all Outreach Ops leads, actions, and import history from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleClearOutreach();
                setClearOutreachOpen(false);
              }}
            >
              Clear data
            </AlertDialogAction>
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
