import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ArrowDown, ArrowUp, Loader2, Mail, Phone, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCRMContext } from '@/contexts/CRMContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  createSequence,
  listEnrollments,
  listSequencesWithDefaults,
  RUNNING_STATUSES,
  updateSequence,
  type Enrollment,
  type Sequence,
  type SequenceAudience,
  type SequenceStep,
} from '@/lib/sequences';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const AUDIENCES: { id: SequenceAudience; label: string }[] = [
  { id: 'venue', label: 'Venues' },
  { id: 'brand', label: 'Brands / chains' },
  { id: 'any', label: 'Anyone' },
];

const NEW_STEP: SequenceStep = { wait_days: 3, channel: 'email', label: 'Follow-up', instructions: '', reply_in_thread: true };

function SequenceEditor({ sequence, onSaved }: { sequence: Sequence; onSaved: () => void }) {
  const [draft, setDraft] = useState(sequence);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(sequence), [sequence]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(sequence);

  const updateStep = (index: number, changes: Partial<SequenceStep>) =>
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, i) => (i === index ? { ...step, ...changes } : step)),
    }));
  const moveStep = (index: number, delta: number) =>
    setDraft((current) => {
      const steps = [...current.steps];
      const target = index + delta;
      if (target < 0 || target >= steps.length) return current;
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...current, steps };
    });

  const save = async () => {
    setSaving(true);
    try {
      await updateSequence(sequence.id, {
        name: draft.name.trim() || 'Untitled sequence',
        description: draft.description,
        audience: draft.audience,
        steps: draft.steps.map((step) => ({ ...step, wait_days: Math.max(0, Math.round(step.wait_days || 0)) })),
      });
      toast('Saved', { description: 'Running sequences use the new steps from their next step on.' });
      onSaved();
    } catch (error) {
      toast.error('Could not save', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 grid gap-1.5">
          <Label>Name</Label>
          <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label>For</Label>
          <Select value={draft.audience} onValueChange={(value) => setDraft({ ...draft, audience: value as SequenceAudience })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCES.map((audience) => (
                <SelectItem key={audience.id} value={audience.id}>
                  {audience.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Input
        placeholder="When to use it"
        value={draft.description}
        onChange={(event) => setDraft({ ...draft, description: event.target.value })}
      />

      <div className="space-y-3">
        {draft.steps.map((step, index) => (
          <div key={index} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground w-12">Step {index + 1}</span>
              <Select value={step.channel} onValueChange={(value) => updateStep(index, { channel: value as SequenceStep['channel'] })}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{index === 0 ? 'after' : '+'}</span>
                <Input
                  type="number"
                  min={0}
                  className="w-16 h-8"
                  value={step.wait_days}
                  onChange={(event) => updateStep(index, { wait_days: Number(event.target.value) })}
                />
                <span>business days</span>
              </div>
              <Input
                className="flex-1 min-w-[140px] h-8"
                placeholder="Label"
                value={step.label}
                onChange={(event) => updateStep(index, { label: event.target.value })}
              />
              <div className="flex">
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move up" onClick={() => moveStep(index, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move down" onClick={() => moveStep(index, 1)}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:text-destructive-foreground"
                  aria-label="Remove step"
                  onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== index) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <Textarea
              rows={2}
              className="text-sm"
              placeholder={step.channel === 'call' ? 'Talking points for the call' : 'What Claude should write in this email'}
              value={step.instructions}
              onChange={(event) => updateStep(index, { instructions: event.target.value })}
            />
            {step.channel === 'email' && index > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={Boolean(step.reply_in_thread)}
                  onCheckedChange={(checked) => updateStep(index, { reply_in_thread: checked })}
                />
                Reply in the same thread as the previous email
              </label>
            )}
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, steps: [...draft.steps, NEW_STEP] })}>
          <Plus className="h-4 w-4 mr-1" />
          Add step
        </Button>
      </div>

      <div className="flex gap-2 justify-end">
        {dirty && (
          <Button variant="outline" onClick={() => setDraft(sequence)} disabled={saving}>
            Discard
          </Button>
        )}
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export default function Sequences() {
  const { getCompanyById } = useCRMContext();
  const [sequences, setSequences] = useState<Sequence[] | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([listSequencesWithDefaults(), listEnrollments()])
      .then(([loadedSequences, loadedEnrollments]) => {
        setSequences(loadedSequences);
        setEnrollments(loadedEnrollments);
        setSelectedId((current) => current ?? loadedSequences[0]?.id ?? null);
      })
      .catch((error) => toast.error('Could not load sequences', { description: errorMessage(error) }));
  }, []);

  useEffect(load, [load]);

  const stats = useMemo(() => {
    const map = new Map<string, { running: number; stopped: number; replied: number; completed: number }>();
    enrollments.forEach((enrollment) => {
      const entry = map.get(enrollment.sequence_id) ?? { running: 0, stopped: 0, replied: 0, completed: 0 };
      if (RUNNING_STATUSES.includes(enrollment.status)) entry.running += 1;
      else if (enrollment.status === 'completed') entry.completed += 1;
      else if (enrollment.stop_reason === 'They replied') entry.replied += 1;
      else entry.stopped += 1;
      map.set(enrollment.sequence_id, entry);
    });
    return map;
  }, [enrollments]);

  const visible = (sequences ?? []).filter((sequence) => !sequence.archived);
  const selected = visible.find((sequence) => sequence.id === selectedId) ?? null;
  const running = enrollments.filter(
    (enrollment) => RUNNING_STATUSES.includes(enrollment.status) && enrollment.sequence_id === selected?.id,
  );

  const handleNew = async () => {
    try {
      const created = await createSequence({
        name: 'New sequence',
        description: '',
        audience: 'any',
        steps: [{ wait_days: 0, channel: 'email', label: 'First email', instructions: '' }],
      });
      setSelectedId(created.id);
      load();
    } catch (error) {
      toast.error('Could not create', { description: errorMessage(error) });
    }
  };

  const handleArchive = async (sequence: Sequence) => {
    if (!window.confirm(`Archive "${sequence.name}"? Running companies finish their current play.`)) return;
    try {
      await updateSequence(sequence.id, { archived: true });
      setSelectedId(null);
      load();
    } catch (error) {
      toast.error('Could not archive', { description: errorMessage(error) });
    }
  };

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Sequences</h1>
          <p className="text-muted-foreground">
            Plays of calls and emails. Start them on a company or a filtered list in{' '}
            <Link to="/companies" className="underline underline-offset-2 hover:text-foreground">
              Companies
            </Link>
            .
          </p>
        </div>
        <Button variant="outline" onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          New sequence
        </Button>
      </div>

      {!sequences ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-2">
            {visible.map((sequence) => {
              const stat = stats.get(sequence.id);
              return (
                <button
                  key={sequence.id}
                  onClick={() => setSelectedId(sequence.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    sequence.id === selectedId ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <p className="font-medium text-sm">{sequence.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                    {sequence.steps.filter((step) => step.channel === 'call').length}
                    <Phone className="h-3 w-3" />
                    {sequence.steps.filter((step) => step.channel === 'email').length}
                    <Mail className="h-3 w-3" />
                    {stat ? `· ${stat.running} running · ${stat.replied} replied` : ''}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selected && (
              <Card>
                <CardHeader className="flex flex-row items-start justify-between pb-3">
                  <div>
                    <CardTitle className="text-lg">{selected.name}</CardTitle>
                    <CardDescription>
                      Each step starts the given number of business days after the previous one was done.
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleArchive(selected)}>
                    Archive
                  </Button>
                </CardHeader>
                <CardContent>
                  <SequenceEditor sequence={selected} onSaved={load} />
                </CardContent>
              </Card>
            )}

            {selected && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Running ({running.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {running.length === 0 && <p className="text-sm text-muted-foreground">Nobody in this sequence right now.</p>}
                  {running.map((enrollment) => {
                    const company = getCompanyById(enrollment.company_id);
                    const step = selected.steps[enrollment.step_index];
                    return (
                      <Link
                        key={enrollment.id}
                        to={`/companies/${enrollment.company_id}`}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <span className="truncate">{company?.name ?? 'Company'}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {enrollment.status === 'paused'
                            ? 'Paused'
                            : enrollment.status === 'waiting'
                              ? `Waiting on you: ${step?.label ?? ''}`
                              : `${step?.label ?? ''}${enrollment.next_step_on ? ` · ${format(parseISO(enrollment.next_step_on), 'd MMM')}` : ''}`}
                        </span>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
