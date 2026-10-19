import { useState } from 'react';
import { toast } from 'sonner';
import figtreeLogo from '@/assets/figtree-logo.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Status = 'idle' | 'sending' | 'sent' | 'verifying' | 'error';

export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    const trimmedEmail = email.trim();
    if (!supabase || !trimmedEmail || status === 'sending' || status === 'verifying') return;
    setStatus('sending');
    setError(null);
    setCode('');
    const { error: sendError } = await supabase.auth.signInWithOtp({ email: trimmedEmail });
    if (sendError) {
      setStatus('error');
      setError(sendError.message);
      return;
    }
    setStatus('sent');
    toast('Code sent', { description: 'Check your email for the 6-digit code.' });
  };

  const handleVerifyCode = async () => {
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!supabase || !trimmedEmail || !trimmedCode || status === 'verifying') return;
    setStatus('verifying');
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: trimmedCode,
      type: 'email',
    });
    if (verifyError) {
      setStatus('error');
      setError(verifyError.message);
    }
    // On success the auth listener swaps this screen for the app.
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src={figtreeLogo} alt="" className="h-10 w-10 mb-2" />
          <CardTitle>Sign in to Figtree</CardTitle>
          <CardDescription>We'll email you a 6-digit code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSupabaseConfigured ? (
            <p className="text-sm text-muted-foreground">
              Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sign in.
            </p>
          ) : (
            <>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSendCode();
                }}
              >
                <div className="grid gap-2">
                  <Label htmlFor="sign-in-email">Email</Label>
                  <Input
                    id="sign-in-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  variant={status === 'sent' ? 'outline' : 'default'}
                  className="w-full"
                  disabled={!email.trim() || status === 'sending' || status === 'verifying'}
                >
                  {status === 'sending' ? 'Sending...' : status === 'sent' ? 'Resend code' : 'Send code'}
                </Button>
              </form>

              {(status === 'sent' || status === 'verifying' || code.trim()) && (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleVerifyCode();
                  }}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="sign-in-code">Code</Label>
                    <Input
                      id="sign-in-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!email.trim() || !code.trim() || status === 'verifying'}
                  >
                    {status === 'verifying' ? 'Verifying...' : 'Sign in'}
                  </Button>
                </form>
              )}

              {status === 'error' && error && <p className="text-xs text-destructive">{error}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
