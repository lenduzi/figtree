import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getCurrentSubscription,
  getPushSupport,
  loadUserSettings,
  saveUserSettings,
  sendTestNotification,
  type UserSettings,
} from '@/lib/notifications';

const DIGEST_HOURS = Array.from({ length: 18 }, (_, index) => index + 5); // 05:00 – 22:00

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function NotificationSettings() {
  const support = getPushSupport();
  const [deviceEnabled, setDeviceEnabled] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCurrentSubscription()
      .then((subscription) => setDeviceEnabled(Boolean(subscription)))
      .catch(() => setDeviceEnabled(false));
    loadUserSettings()
      .then((loaded) => setSettings(loaded ?? { timezone: '', digest_enabled: true, digest_hour: 9 }))
      .catch((error) => toast.error('Could not load notification settings', { description: errorMessage(error) }));
  }, []);

  const toggleDevice = async () => {
    setBusy(true);
    try {
      if (deviceEnabled) {
        await disablePushOnThisDevice();
        setDeviceEnabled(false);
        toast('Notifications turned off on this device');
      } else {
        await enablePushOnThisDevice();
        setDeviceEnabled(true);
        toast('Notifications turned on for this device');
      }
    } catch (error) {
      toast.error('Could not change notifications', { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const updateSettings = async (changes: Partial<UserSettings>) => {
    const previous = settings;
    setSettings((current) => (current ? { ...current, ...changes } : current));
    try {
      await saveUserSettings(changes);
    } catch (error) {
      setSettings(previous);
      toast.error('Could not save notification settings', { description: errorMessage(error) });
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      const result = await sendTestNotification();
      if (result.devices === 0) {
        toast('No devices have notifications on yet.');
      } else {
        toast(`Test sent to ${result.sent} of ${result.devices} device${result.devices === 1 ? '' : 's'}`);
      }
    } catch (error) {
      toast.error('Test notification failed', { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Task reminders at their due time, and a morning digest of what needs attention.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">This device</p>
            <p className="text-xs text-muted-foreground">
              {support === 'needs-install' &&
                'On iPhone, add Figtree to your Home Screen (Share → Add to Home Screen) and open it from there.'}
              {support === 'unsupported' && "This browser doesn't support push notifications."}
              {support === 'supported' &&
                (deviceEnabled ? 'Notifications are on for this device.' : 'Notifications are off for this device.')}
            </p>
          </div>
          {support === 'supported' && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={toggleDevice} disabled={busy || deviceEnabled === null}>
                {deviceEnabled ? 'Turn off' : 'Turn on'}
              </Button>
              {deviceEnabled && (
                <Button variant="outline" onClick={handleTest} disabled={busy}>
                  Send test
                </Button>
              )}
            </div>
          )}
        </div>

        {settings && (
          <div className="rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="digest-enabled" className="text-sm font-medium">
                  Morning digest
                </Label>
                <p className="text-xs text-muted-foreground">
                  Overdue and due tasks, outreach due, and deals going cold.
                </p>
              </div>
              <Switch
                id="digest-enabled"
                checked={settings.digest_enabled}
                onCheckedChange={(checked) => updateSettings({ digest_enabled: checked })}
              />
            </div>
            {settings.digest_enabled && (
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">Send at</Label>
                <Select
                  value={String(settings.digest_hour)}
                  onValueChange={(value) => updateSettings({ digest_hour: Number(value) })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIGEST_HOURS.map((hour) => (
                      <SelectItem key={hour} value={String(hour)}>
                        {String(hour).padStart(2, '0')}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {settings.timezone && (
              <p className="text-xs text-muted-foreground">Times use your timezone: {settings.timezone}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
