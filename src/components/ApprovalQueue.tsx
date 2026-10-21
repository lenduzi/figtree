import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useCRMContext } from '@/contexts/CRMContext';
import { EmailComposeDialog } from '@/components/CompanyEmails';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getGmailAccount, listDraftEmails, type EmailRecord } from '@/lib/gmail';

/** Sequence emails Claude drafted, waiting for the user to approve, edit or skip. */
export function ApprovalQueue() {
  const { getCompanyById, contacts } = useCRMContext();
  const [drafts, setDrafts] = useState<EmailRecord[]>([]);
  const [gmailAddress, setGmailAddress] = useState<string | undefined>();
  const [open, setOpen] = useState<EmailRecord | null>(null);

  const load = useCallback(() => {
    listDraftEmails()
      .then(setDrafts)
      .catch((error) => toast.error('Could not load drafts', { description: error instanceof Error ? error.message : String(error) }));
  }, []);

  useEffect(() => {
    load();
    getGmailAccount()
      .then((account) => setGmailAddress(account?.email))
      .catch(() => undefined);
    // New drafts appear while the app is open; check when coming back to it.
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  if (drafts.length === 0) return null;
  const company = open ? getCompanyById(open.company_id) : undefined;

  return (
    <Card className="mb-4 lg:mb-8 border-primary/30">
      <CardHeader className="pb-3 lg:pb-4 lg:px-6">
        <CardTitle className="flex items-center gap-2 text-foreground text-lg lg:text-xl">
          <MailCheck className="h-5 w-5 lg:h-6 lg:w-6" />
          To Approve ({drafts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 lg:px-6">
        {drafts.map((draft) => {
          const draftCompany = getCompanyById(draft.company_id);
          return (
            <button
              key={draft.id}
              onClick={() => setOpen(draft)}
              className="w-full text-left p-3 lg:p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm lg:text-base font-medium truncate">{draftCompany?.name ?? draft.to_email}</p>
                  <p className="text-xs lg:text-sm text-muted-foreground truncate">{draft.subject}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          );
        })}
      </CardContent>

      {open && company && (
        <EmailComposeDialog
          open={!!open}
          onOpenChange={(next) => !next && setOpen(null)}
          company={company}
          people={contacts.filter((contact) => contact.companyId === company.id)}
          gmailAddress={gmailAddress}
          draft={open}
          onDone={load}
        />
      )}
    </Card>
  );
}
