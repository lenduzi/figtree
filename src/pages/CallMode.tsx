import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addDays, formatDistanceToNow, setHours, setMinutes, startOfDay } from 'date-fns';
import { Globe, Import, MapPin, MessageCircle, Phone, Search, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { useCRMContext } from '@/contexts/CRMContext';
import { LifecycleBadge } from '@/components/LifecycleBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { buildWhatsAppLink, parseLeadCandidates, type LeadCandidate } from '@/lib/outreach-store';
import { toLocalDateKey } from '@/lib/utils';
import type { ActivityType, Company, Lifecycle } from '@/types/crm';

/** Days until the next attempt after each unanswered call (4 attempts in ~10 days). */
const CALL_CADENCE_DAYS = [0, 2, 3, 5];
const QUEUE_STAGES: Lifecycle[] = ['sourced', 'qualified', 'contacting', 'talking'];

type Queue = 'due' | 'all';

type Outcome = {
  id: string;
  label: string;
  activity: ActivityType;
  description: string;
  variant?: 'default' | 'outline' | 'destructive';
};

const OUTCOMES: Outcome[] = [
  { id: 'no_answer', label: 'No answer', activity: 'call_attempted', description: 'Called, no answer', variant: 'outline' },
  { id: 'gatekeeper', label: 'Reached front desk', activity: 'call', description: 'Reached the front desk', variant: 'outline' },
  { id: 'decision_maker', label: 'Spoke to decision-maker', activity: 'call', description: 'Spoke to the decision-maker' },
  { id: 'interested', label: 'Interested', activity: 'call', description: 'Interested' },
  { id: 'not_now', label: 'Not now', activity: 'call', description: 'Not now', variant: 'outline' },
  { id: 'no', label: 'No', activity: 'call', description: 'Not interested', variant: 'outline' },
  { id: 'invalid', label: 'Wrong number / closed', activity: 'call_attempted', description: 'Wrong number or closed', variant: 'outline' },
];

const nineAm = (date: Date) => setMinutes(setHours(startOfDay(date), 9), 0);
const isDue = (company: Company, now = new Date()) =>
  !!company.nextActionAt && new Date(company.nextActionAt) < addDays(startOfDay(now), 1);

const digits = (value: string) => value.replace(/\D/g, '');
const host = (value: string) => {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).host.replace(/^www\./, '');
  } catch {
    return '';
  }
};

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { companies, addCompanies } = useCRMContext();
  const [parsed, setParsed] = useState<{ fresh: LeadCandidate[]; duplicates: number; skipped: number } | null>(null);
  const [listName, setListName] = useState('');

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const { candidates, skipped } = parseLeadCandidates(await file.text());
    const known = {
      phones: new Set(companies.map((company) => digits(company.phone)).filter((value) => value.length >= 6)),
      hosts: new Set(companies.map((company) => host(company.website)).filter(Boolean)),
      maps: new Set(companies.map((company) => company.googleMapsUrl).filter(Boolean)),
      names: new Set(companies.map((company) => `${company.name}|${company.city}`.toLowerCase())),
    };
    const fresh: LeadCandidate[] = [];
    let duplicates = 0;
    candidates.forEach((candidate) => {
      const phone = digits(candidate.phone);
      const site = host(candidate.website);
      const key = `${candidate.name}|${candidate.city}`.toLowerCase();
      if (
        (phone.length >= 6 && known.phones.has(phone)) ||
        (site && known.hosts.has(site)) ||
        (candidate.googleMapsUrl && known.maps.has(candidate.googleMapsUrl)) ||
        known.names.has(key)
      ) {
        duplicates += 1;
        return;
      }
      known.names.add(key);
      if (phone.length >= 6) known.phones.add(phone);
      fresh.push(candidate);
    });
    setParsed({ fresh, duplicates, skipped });
    setListName(file.name.replace(/\.[^.]+$/, ''));
  };

  const handleImport = () => {
    if (!parsed) return;
    const now = new Date().toISOString();
    addCompanies(
      parsed.fresh.map((candidate) => ({
        name: candidate.name,
        type: 'venue' as const,
        city: candidate.city,
        address: candidate.address,
        phone: candidate.phone,
        website: candidate.website,
        googleMapsUrl: candidate.googleMapsUrl,
        industry: candidate.industry,
        fit: candidate.fit,
        fitScore: candidate.fitScore,
        lifecycle: 'sourced' as const,
        source: 'csv',
        lists: listName.trim() ? [listName.trim()] : [],
        nextAction: candidate.phone ? 'Call' : null,
        nextActionAt: candidate.phone ? now : null,
      })),
    );
    toast('Import complete', { description: `${parsed.fresh.length} companies added, ${parsed.duplicates} already known.` });
    setParsed(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setParsed(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
          <DialogDescription>
            E.g. a Google Maps export. Columns like name, city, address, phone, website and maps link are detected
            automatically; companies you already have are skipped.
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".csv,text/csv" onChange={(event) => handleFile(event.target.files?.[0])} />
        {parsed && (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{parsed.fresh.length} new</span> · {parsed.duplicates} already in Figtree
              {parsed.skipped > 0 ? ` · ${parsed.skipped} rows without a name` : ''}
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="import-list">Add them to list</Label>
              <Input id="import-list" value={listName} onChange={(event) => setListName(event.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!parsed || parsed.fresh.length === 0}>
            Import {parsed ? parsed.fresh.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CallMode() {
  const { companies, contacts, getCompanyActivities, updateCompany, logActivity, addTask } = useCRMContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [queue, setQueue] = useState<Queue>('due');
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('company'));
  const [callNote, setCallNote] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  // ?company=<id> opens that company once, then the param is dropped.
  useEffect(() => {
    if (!searchParams.has('company')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('company');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const lists = useMemo(
    () => [...new Set(companies.flatMap((company) => company.lists))].sort((a, b) => a.localeCompare(b)),
    [companies],
  );

  const callable = useMemo(
    () => companies.filter((company) => company.phone && QUEUE_STAGES.includes(company.lifecycle)),
    [companies],
  );
  const dueCount = callable.filter((company) => isDue(company)).length;

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const fitRank = { A: 0, B: 1, C: 2 } as const;
    return callable
      .filter((company) => queue === 'all' || isDue(company))
      .filter((company) => listFilter === 'all' || company.lists.includes(listFilter))
      .filter((company) =>
        !query || [company.name, company.city, company.industry].some((value) => value.toLowerCase().includes(query)),
      )
      .sort((a, b) => {
        // Best fit first, then whoever has waited longest.
        const fit = (fitRank[a.fit ?? 'C'] ?? 3) - (fitRank[b.fit ?? 'C'] ?? 3);
        if (fit !== 0) return fit;
        return (a.nextActionAt ?? '9999').localeCompare(b.nextActionAt ?? '9999');
      });
  }, [callable, queue, listFilter, search]);

  const selected = companies.find((company) => company.id === selectedId) ?? null;
  const selectedPeople = selected ? contacts.filter((contact) => contact.companyId === selected.id) : [];
  const recent = selected ? getCompanyActivities(selected.id).slice(0, 4) : [];

  const openCompany = (company: Company | null) => {
    setSelectedId(company?.id ?? null);
    setCallNote('');
  };

  const nextInQueue = () => {
    if (!selected) return null;
    const index = visible.findIndex((company) => company.id === selected.id);
    return visible.slice(index + 1).find((company) => company.id !== selected.id) ?? null;
  };

  const logOutcome = (outcome: Outcome) => {
    if (!selected) return;
    const note = callNote.trim();
    logActivity({ companyId: selected.id }, outcome.activity, note ? `${outcome.description}: ${note}` : outcome.description);

    const today = new Date();
    const updates: Partial<Company> = {};
    const scheduleNextAttempt = () => {
      const nextStep = selected.cadenceStep + 1;
      updates.cadenceStep = nextStep;
      if (nextStep < CALL_CADENCE_DAYS.length) {
        updates.nextAction = 'Call';
        updates.nextActionAt = nineAm(addDays(today, CALL_CADENCE_DAYS[nextStep])).toISOString();
      } else {
        updates.nextAction = null;
        updates.nextActionAt = null;
        toast(`${CALL_CADENCE_DAYS.length} calls without reaching anyone`, {
          description: 'Consider Not now, or email them instead.',
        });
      }
    };
    const stopCalling = () => {
      updates.nextAction = null;
      updates.nextActionAt = null;
    };
    const followUp = (title: string, days: number) =>
      addTask({
        companyId: selected.id,
        contactId: null,
        title,
        description: note,
        dueDate: toLocalDateKey(addDays(today, days)),
        hasReminder: true,
        completed: false,
      });

    switch (outcome.id) {
      case 'no_answer':
        if (selected.lifecycle === 'sourced' || selected.lifecycle === 'qualified') updates.lifecycle = 'contacting';
        scheduleNextAttempt();
        break;
      case 'gatekeeper':
        if (selected.lifecycle === 'sourced' || selected.lifecycle === 'qualified') updates.lifecycle = 'contacting';
        updates.nextAction = 'Call';
        updates.nextActionAt = nineAm(addDays(today, 2)).toISOString();
        break;
      case 'decision_maker':
        updates.lifecycle = 'talking';
        stopCalling();
        followUp(`Follow up with ${selected.name}`, 2);
        break;
      case 'interested':
        updates.lifecycle = 'talking';
        stopCalling();
        followUp(`Send info / book a meeting: ${selected.name}`, 1);
        break;
      case 'not_now':
        updates.lifecycle = 'not_now';
        updates.revisitOn = toLocalDateKey(addDays(today, 60));
        stopCalling();
        break;
      case 'no':
        updates.lifecycle = 'lost';
        updates.lostReason = note;
        stopCalling();
        break;
      case 'invalid':
        updates.lifecycle = 'disqualified';
        stopCalling();
        break;
    }
    updateCompany(selected.id, updates);
    toast(`${selected.name}: ${outcome.label}`);
    openCompany(nextInQueue());
  };

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Call Mode</h1>
          <p className="text-muted-foreground">Work through your call list. Log the outcome and the next call is scheduled.</p>
        </div>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Import className="h-4 w-4 mr-2" />
          Import CSV
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Due now', value: dueCount },
          { label: 'Contacting', value: companies.filter((company) => company.lifecycle === 'contacting').length },
          { label: 'Talking', value: companies.filter((company) => company.lifecycle === 'talking').length },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Select value={queue} onValueChange={(value) => setQueue(value as Queue)}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="due">Due now</SelectItem>
            <SelectItem value="all">Everyone to call</SelectItem>
          </SelectContent>
        </Select>
        <Select value={listFilter} onValueChange={setListFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lists</SelectItem>
            {lists.map((list) => (
              <SelectItem key={list} value={list}>
                {list}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card divide-y">
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">
            {queue === 'due' ? 'No calls due. Nice.' : 'No companies with a phone number in the funnel.'}
          </p>
        )}
        {visible.slice(0, 200).map((company) => (
          <button
            key={company.id}
            onClick={() => openCompany(company)}
            className="w-full text-left px-4 py-3 hover:bg-muted/40 flex items-center gap-3"
          >
            <span className="w-6 text-xs font-semibold text-muted-foreground">{company.fit ?? '–'}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{company.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {[company.city, company.industry].filter(Boolean).join(' · ')}
              </p>
            </div>
            <LifecycleBadge lifecycle={company.lifecycle} className="hidden sm:inline-flex" />
            <span className="text-xs text-muted-foreground w-28 text-right shrink-0">
              {company.nextActionAt ? formatDistanceToNow(new Date(company.nextActionAt), { addSuffix: true }) : '—'}
            </span>
          </button>
        ))}
        {visible.length > 200 && (
          <p className="text-xs text-muted-foreground text-center py-3">Showing 200 of {visible.length}. Narrow it down with search or lists.</p>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && openCompany(null)}>
        <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-y-auto">
          {selected && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <Link to={`/companies/${selected.id}`} className="hover:underline">
                    {selected.name}
                  </Link>
                  <LifecycleBadge lifecycle={selected.lifecycle} />
                  {selected.fit && <span className="text-xs text-muted-foreground">Fit {selected.fit}</span>}
                </DialogTitle>
                <DialogDescription>
                  {[selected.industry, selected.city, selected.address].filter(Boolean).join(' · ')}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={`tel:${selected.phone}`}>
                    <Phone className="h-4 w-4 mr-2" />
                    {selected.phone}
                  </a>
                </Button>
                {digits(selected.phone).length >= 8 && (
                  <Button variant="outline" asChild>
                    <a href={buildWhatsAppLink(selected.phone, '')} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      WhatsApp
                    </a>
                  </Button>
                )}
                {selected.website && (
                  <Button variant="outline" size="icon" asChild aria-label="Website">
                    <a href={/^https?:/i.test(selected.website) ? selected.website : `https://${selected.website}`} target="_blank" rel="noreferrer">
                      <Globe className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                {selected.googleMapsUrl && (
                  <Button variant="outline" size="icon" asChild aria-label="Google Maps">
                    <a href={selected.googleMapsUrl} target="_blank" rel="noreferrer">
                      <MapPin className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>

              {selectedPeople.length > 0 && (
                <div className="text-sm space-y-1">
                  {selectedPeople.map((person) => (
                    <p key={person.id}>
                      <span className="font-medium">{person.fullName}</span>
                      {person.role ? ` · ${person.role}` : ''}
                      {person.phone ? ` · ${person.phone}` : ''}
                    </p>
                  ))}
                </div>
              )}

              {(selected.notes || recent.length > 0) && (
                <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
                  {selected.notes && <p className="whitespace-pre-wrap text-foreground">{selected.notes}</p>}
                  {recent.map((activity) => (
                    <p key={activity.id} className="text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}: {activity.description}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="call-note">Note for this call</Label>
                <Textarea
                  id="call-note"
                  rows={2}
                  placeholder="Who you spoke to, what they said, best time to call back…"
                  value={callNote}
                  onChange={(event) => setCallNote(event.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {OUTCOMES.map((outcome) => (
                  <Button key={outcome.id} variant={outcome.variant ?? 'default'} onClick={() => logOutcome(outcome)}>
                    {outcome.label}
                  </Button>
                ))}
              </div>

              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => openCompany(nextInQueue())}>
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
