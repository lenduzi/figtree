import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Mail, Pause, Phone, Play, Square, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { useCRMContext } from '@/contexts/CRMContext';
import { StartSequenceDialog } from '@/components/StartSequenceDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  listEnrollments,
  listSequences,
  pauseEnrollment,
  resumeEnrollment,
  RUNNING_STATUSES,
  stopEnrollment,
  type Enrollment,
  type Sequence,
} from '@/lib/sequences';
import type { Company } from '@/types/crm';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function CompanySequenceCard({ company }: { company: Company }) {
  const { deleteTask, refreshData } = useCRMContext();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [startOpen, setStartOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([listEnrollments({ companyId: company.id }), listSequences()])
      .then(([loadedEnrollments, loadedSequences]) => {
        setEnrollments(loadedEnrollments);
        setSequences(loadedSequences);
      })
      .catch((error) => toast.error('Could not load sequences', { description: errorMessage(error) }));
  }, [company.id]);

  useEffect(load, [load]);

  const running = enrollments.find((enrollment) => RUNNING_STATUSES.includes(enrollment.status));
  const history = enrollments.filter((enrollment) => enrollment !== running).slice(0, 3);
  const sequenceOf = (enrollment: Enrollment) => sequences.find((sequence) => sequence.id === enrollment.sequence_id);

  const describe = (enrollment: Enrollment) => {
    const sequence = sequenceOf(enrollment);
    const step = sequence?.steps[enrollment.step_index];
    if (enrollment.status === 'paused') return 'Paused';
    if (enrollment.status === 'waiting') {
      return enrollment.pending_email_id
        ? `Waiting for you: approve the "${step?.label}" email (in Today)`
        : `Waiting for you: "${step?.label}" task (in Today)`;
    }
    if (!step) return 'Finishing…';
    const when = enrollment.next_step_on ? format(parseISO(enrollment.next_step_on), 'EEE d MMM') : 'soon';
    return `Next: ${step.label} (${step.channel}) on ${when}`;
  };

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      load();
    } catch (error) {
      toast.error('Something went wrong', { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const runningSequence = running ? sequenceOf(running) : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Workflow className="h-4 w-4" />
          Sequence
        </CardTitle>
        {!running && (
          <Button size="sm" variant="outline" onClick={() => setStartOpen(true)}>
            Start
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {running && runningSequence ? (
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{runningSequence.name}</p>
                <p className="text-xs text-muted-foreground">
                  Step {Math.min(running.step_index + 1, runningSequence.steps.length)} of {runningSequence.steps.length}
                </p>
              </div>
              <div className="flex gap-1">
                {running.status === 'paused' ? (
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Resume" disabled={busy} onClick={() => act(() => resumeEnrollment(running))}>
                    <Play className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Pause" disabled={busy} onClick={() => act(() => pauseEnrollment(running.id))}>
                    <Pause className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 hover:text-destructive-foreground"
                  aria-label="Stop"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      const taskId = await stopEnrollment(running);
                      if (taskId) deleteTask(taskId);
                      refreshData();
                    })
                  }
                >
                  <Square className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-sm">{describe(running)}</p>
            <ol className="space-y-1">
              {runningSequence.steps.map((step, index) => (
                <li
                  key={index}
                  className={`flex items-center gap-2 text-xs ${
                    index < running.step_index
                      ? 'text-muted-foreground line-through'
                      : index === running.step_index
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground'
                  }`}
                >
                  {step.channel === 'call' ? <Phone className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                  {step.label}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No sequence running. Start one to have follow-ups prepared for you, with emails drafted for your approval.
          </p>
        )}

        {history.length > 0 && (
          <div className="space-y-1">
            {history.map((enrollment) => (
              <p key={enrollment.id} className="text-xs text-muted-foreground">
                {sequenceOf(enrollment)?.name ?? 'Sequence'} · {enrollment.status}
                {enrollment.stop_reason ? ` (${enrollment.stop_reason})` : ''}
                {enrollment.finished_at ? ` · ${format(parseISO(enrollment.finished_at), 'd MMM')}` : ''}
              </p>
            ))}
          </div>
        )}
      </CardContent>

      <StartSequenceDialog open={startOpen} onOpenChange={setStartOpen} companies={[company]} onStarted={load} />
    </Card>
  );
}
