import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useCRMContext } from '@/contexts/CRMContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  enrollCompanies,
  listEnrollments,
  listSequencesWithDefaults,
  type Sequence,
} from '@/lib/sequences';
import { toLocalDateKey } from '@/lib/utils';
import type { Company } from '@/types/crm';

const COMPANY_ADDRESS = 'company';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Picks the play that fits where most of these companies are. */
const suggestedFor = (companies: Company[], sequences: Sequence[]) => {
  const count = (stages: string[]) => companies.filter((company) => stages.includes(company.lifecycle)).length;
  const byStage: [number, string][] = [
    [count(['sourced', 'qualified', 'contacting']), 'cold'],
    [count(['talking', 'meeting']), 'After a first call'],
    [count(['proposal', 'pilot']), 'Proposal chase'],
    [count(['not_now', 'lost']), 'Reactivation'],
  ];
  const [, play] = byStage.sort((a, b) => b[0] - a[0])[0];
  if (play !== 'cold') return sequences.find((sequence) => sequence.name === play) ?? sequences[0];
  const venues = companies.filter((company) => company.type === 'venue').length;
  const brands = companies.filter((company) => company.type === 'brand' || company.type === 'chain').length;
  const audience = venues >= brands && venues > 0 ? 'venue' : 'brand';
  return sequences.find((sequence) => sequence.audience === audience) ?? sequences[0];
};

type StartSequenceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: Company[];
  onStarted?: () => void;
};

export function StartSequenceDialog({ open, onOpenChange, companies, onStarted }: StartSequenceDialogProps) {
  const { contacts, updateCompany } = useCRMContext();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [sequenceId, setSequenceId] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [recipient, setRecipient] = useState(COMPANY_ADDRESS);
  const [starting, setStarting] = useState(false);
  const single = companies.length === 1 ? companies[0] : null;
  const singlePeople = single ? contacts.filter((contact) => contact.companyId === single.id && contact.email?.includes('@')) : [];

  useEffect(() => {
    if (!open) return;
    Promise.all([listSequencesWithDefaults(), listEnrollments({ running: true })])
      .then(([loaded, running]) => {
        const active = loaded.filter((sequence) => !sequence.archived);
        setSequences(active);
        setSequenceId(suggestedFor(companies, active)?.id ?? '');
        setBusyIds(new Set(running.map((enrollment) => enrollment.company_id)));
      })
      .catch((error) => toast.error('Could not load sequences', { description: errorMessage(error) }));
    setRecipient(singlePeople[0]?.id ?? COMPANY_ADDRESS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sequence = sequences.find((item) => item.id === sequenceId);
  const hasEmailSteps = sequence?.steps.some((step) => step.channel === 'email') ?? false;
  const hasCallSteps = sequence?.steps.some((step) => step.channel === 'call') ?? false;

  /** Who each company's emails go to: chosen person, else first person with an email, else the company. */
  const targets = useMemo(
    () =>
      companies
        .filter((company) => !busyIds.has(company.id))
        .map((company) => {
          const people = contacts.filter((contact) => contact.companyId === company.id && contact.email?.includes('@'));
          const person = single
            ? people.find((contact) => contact.id === recipient) ?? null
            : people[0] ?? null;
          return {
            company,
            contactId: person?.id ?? null,
            toEmail: person?.email ?? (company.email.includes('@') ? company.email : ''),
          };
        }),
    [companies, busyIds, contacts, recipient, single],
  );
  const withEmail = targets.filter((target) => target.toEmail).length;
  const withPhone = targets.filter((target) => target.company.phone).length;
  const alreadyRunning = companies.length - targets.length;

  const handleStart = async () => {
    if (!sequence || targets.length === 0) return;
    setStarting(true);
    try {
      const result = await enrollCompanies(
        sequence,
        targets.map((target) => ({
          companyId: target.company.id,
          contactId: target.contactId,
          toEmail: target.toEmail,
          lifecycle: target.company.lifecycle,
        })),
        toLocalDateKey(),
      );
      // The sequence owns follow-ups now; take them out of the Call Mode cadence.
      targets.forEach((target) => {
        if (target.company.nextActionAt) updateCompany(target.company.id, { nextAction: null, nextActionAt: null });
      });
      toast(`Started "${sequence.name}" for ${result.started} ${result.started === 1 ? 'company' : 'companies'}`, {
        description: 'The first step shows up in Today within a few minutes (weekdays from 7:00).',
      });
      onStarted?.();
      onOpenChange(false);
    } catch (error) {
      toast.error('Could not start the sequence', { description: errorMessage(error) });
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start a sequence</DialogTitle>
          <DialogDescription>
            {single ? single.name : `${companies.length} companies`} · emails wait for your approval in Today.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Play</Label>
            <Select value={sequenceId} onValueChange={setSequenceId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a sequence" />
              </SelectTrigger>
              <SelectContent>
                {sequences.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sequence && (
              <ol className="text-xs text-muted-foreground space-y-1 pt-1">
                {sequence.steps.map((step, index) => (
                  <li key={index} className="flex items-center gap-2">
                    {step.channel === 'call' ? <Phone className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                    <span>
                      {index === 0 ? (step.wait_days ? `Day ${step.wait_days}` : 'Start') : `+${step.wait_days}d`} · {step.label}
                      {step.reply_in_thread ? ' (same thread)' : ''}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <Link to="/sequences" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Edit plays
            </Link>
          </div>

          {single && hasEmailSteps && (
            <div className="grid gap-2">
              <Label>Emails go to</Label>
              <Select value={recipient} onValueChange={setRecipient}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {singlePeople.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.fullName} ({person.email})
                    </SelectItem>
                  ))}
                  <SelectItem value={COMPANY_ADDRESS}>
                    {single.email ? `Company address (${single.email})` : 'No address yet (email steps become tasks)'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <p>
              <span className="font-medium">{targets.length}</span> will start
              {alreadyRunning > 0 && <span className="text-muted-foreground"> · {alreadyRunning} already in a sequence (skipped)</span>}
            </p>
            {hasEmailSteps && (
              <p className="text-muted-foreground text-xs">
                {withEmail} with an email address. For the rest, email steps become a task to find an address.
              </p>
            )}
            {hasCallSteps && (
              <p className="text-muted-foreground text-xs">{withPhone} with a phone number for the call steps.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={!sequence || targets.length === 0 || starting}>
            {starting ? 'Starting…' : `Start for ${targets.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
