import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { connectGmail, disconnectGmail, getGmailAccount } from '@/lib/gmail';
import { loadUserSettings, saveUserSettings, type UserSettings } from '@/lib/notifications';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const CONNECT_ERRORS: Record<string, string> = {
  access_denied: 'You cancelled the Google sign-in.',
  missing_permissions: 'Figtree needs both permissions (send email and read email headers). Try again and tick both.',
  expired: 'The sign-in took too long. Try again.',
};

type AiSettings = Pick<UserSettings, 'email_notifications' | 'ai_context' | 'email_signature'>;

export function GmailSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [account, setAccount] = useState<{ email: string } | null | undefined>(undefined);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<AiSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getGmailAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
    loadUserSettings()
      .then((loaded) => {
        const values = {
          email_notifications: loaded?.email_notifications ?? true,
          ai_context: loaded?.ai_context ?? '',
          email_signature: loaded?.email_signature ?? '',
        };
        setSettings(values);
        setSavedSettings(values);
      })
      .catch((error) => toast.error('Could not load email settings', { description: errorMessage(error) }));
  }, []);

  // Google sends the user back here with ?gmail=connected or ?gmail=error&reason=...
  useEffect(() => {
    const result = searchParams.get('gmail');
    if (!result) return;
    if (result === 'connected') {
      toast('Gmail connected');
    } else {
      const reason = searchParams.get('reason') ?? '';
      toast.error('Gmail was not connected', { description: CONNECT_ERRORS[reason] ?? reason });
    }
    const next = new URLSearchParams(searchParams);
    next.delete('gmail');
    next.delete('reason');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleConnect = async () => {
    setBusy(true);
    try {
      await connectGmail();
    } catch (error) {
      toast.error('Could not start Gmail sign-in', { description: errorMessage(error) });
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectGmail();
      setAccount(null);
      toast('Gmail disconnected');
    } catch (error) {
      toast.error('Could not disconnect Gmail', { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const save = async (changes: Partial<AiSettings>) => {
    try {
      await saveUserSettings(changes);
      setSavedSettings((current) => (current ? { ...current, ...changes } : current));
      return true;
    } catch (error) {
      toast.error('Could not save', { description: errorMessage(error) });
      return false;
    }
  };

  const textChanged =
    settings &&
    savedSettings &&
    (settings.ai_context !== savedSettings.ai_context || settings.email_signature !== savedSettings.email_signature);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Gmail & AI drafting</CardTitle>
        <CardDescription>
          Send and schedule emails to contacts from your Gmail, get notified of replies, and draft with Claude.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Gmail</p>
            <p className="text-xs text-muted-foreground">
              {account === undefined && 'Checking…'}
              {account === null && 'Not connected.'}
              {account && `Connected as ${account.email}`}
            </p>
          </div>
          {account !== undefined && (
            <Button variant="outline" onClick={account ? handleDisconnect : handleConnect} disabled={busy}>
              {account ? 'Disconnect' : 'Connect Gmail'}
            </Button>
          )}
        </div>

        {settings && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="email-notifications" className="text-sm font-medium">
                  Email me reminders and the morning digest
                </Label>
                <p className="text-xs text-muted-foreground">Sent from your Gmail to yourself.</p>
              </div>
              <Switch
                id="email-notifications"
                checked={settings.email_notifications}
                disabled={!account}
                onCheckedChange={(checked) => {
                  setSettings({ ...settings, email_notifications: checked });
                  save({ email_notifications: checked });
                }}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ai-context">About you and your offer</Label>
              <Textarea
                id="ai-context"
                rows={5}
                placeholder="Who you are, what you sell, who you sell to, your tone. Claude uses this for every draft."
                value={settings.ai_context}
                onChange={(event) => setSettings({ ...settings, ai_context: event.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email-signature">Fallback signature</Label>
              <p className="text-xs text-muted-foreground">
                Emails use your Gmail signature automatically. This is only used if your Gmail account has none.
              </p>
              <Textarea
                id="email-signature"
                rows={3}
                placeholder={'Best,\nYour Name'}
                value={settings.email_signature}
                onChange={(event) => setSettings({ ...settings, email_signature: event.target.value })}
              />
            </div>
            <Button
              variant="outline"
              disabled={!textChanged}
              onClick={async () => {
                if (await save({ ai_context: settings.ai_context, email_signature: settings.email_signature })) {
                  toast('Saved');
                }
              }}
            >
              Save
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
