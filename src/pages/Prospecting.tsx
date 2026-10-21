import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Check, Globe, Instagram, Loader2, MapPin, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCRMContext } from '@/contexts/CRMContext';
import { instagramUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  deleteSearch,
  ESTIMATED_COST_EUR,
  getResearchBudget,
  listRecentJobs,
  listSearches,
  runSearchNow,
  saveSearch,
  type ProspectSearch,
  type ResearchJob,
  type SearchStrategy,
} from '@/lib/research';
import { COMPANY_TYPES, type Company, type CompanyType } from '@/types/crm';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const EMPTY_SEARCH = {
  name: '',
  query: '',
  location: '',
  company_type: 'venue' as CompanyType | 'any',
  strategy: 'lookalike' as SearchStrategy,
  weekly_target: 10,
  active: true,
};

const INTENT_PRESET = {
  strategy: 'intent' as SearchStrategy,
  query: 'companies building or running a brand ambassador, creator or UGC program',
  location: 'DACH (Germany, Austria, Switzerland)',
  company_type: 'any' as const,
  name: 'Building an ambassador program',
};

function SearchDialog({
  search,
  open,
  onOpenChange,
  onSaved,
}: {
  search: ProspectSearch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState(EMPTY_SEARCH);
  useEffect(() => {
    if (open) setFields(search ? { ...EMPTY_SEARCH, ...search } : EMPTY_SEARCH);
  }, [open, search]);

  const handleSave = async () => {
    try {
      await saveSearch({
        ...(search ? { id: search.id } : {}),
        name: fields.name.trim() || `${fields.query} ${fields.location}`.trim(),
        query: fields.query.trim(),
        location: fields.location.trim(),
        company_type: fields.company_type,
        strategy: fields.strategy,
        weekly_target: Math.min(50, Math.max(1, Math.round(fields.weekly_target))),
        active: fields.active,
      });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error('Could not save', { description: errorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{search ? 'Edit search' : 'New prospect search'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Kind of search</Label>
            <Select
              value={fields.strategy}
              onValueChange={(value) =>
                setFields(value === 'intent' && !fields.query ? { ...fields, ...INTENT_PRESET } : { ...fields, strategy: value as SearchStrategy })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="intent">Buying signals (e.g. building an ambassador program)</SelectItem>
                <SelectItem value="lookalike">Look-alike businesses (e.g. Paint & Sip in Hamburg)</SelectItem>
              </SelectContent>
            </Select>
            {fields.strategy === 'intent' && (
              <p className="text-xs text-muted-foreground">
                Looks for job ads, "become an ambassador" pages, creator recruiting and ambassador software, in any
                industry, and saves the evidence with a link.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>What to look for</Label>
            <Input
              autoFocus
              placeholder="e.g. Paint & Sip studios, escape rooms, pottery workshops"
              value={fields.query}
              onChange={(event) => setFields({ ...fields, query: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Where</Label>
              <Input
                placeholder="e.g. Hamburg"
                value={fields.location}
                onChange={(event) => setFields({ ...fields, location: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={fields.company_type} onValueChange={(value) => setFields({ ...fields, company_type: value as CompanyType | 'any' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any (let research decide)</SelectItem>
                  {COMPANY_TYPES.filter((type) => type.id !== 'other').map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>New per week</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={fields.weekly_target}
                onChange={(event) => setFields({ ...fields, weekly_target: Number(event.target.value) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>List name</Label>
              <Input
                placeholder="Defaults to what + where"
                value={fields.name}
                onChange={(event) => setFields({ ...fields, name: event.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={fields.active} onCheckedChange={(checked) => setFields({ ...fields, active: checked })} />
            Run automatically every week
          </label>
          <p className="text-xs text-muted-foreground">
            About €{(ESTIMATED_COST_EUR.prospectRun + fields.weekly_target * ESTIMATED_COST_EUR.enrich).toFixed(0)} per
            weekly run: finding {fields.weekly_target} companies and researching each.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!fields.query.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProspectCard({ company, onAccept, onReject }: { company: Company; onAccept: () => void; onReject: (reason: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/companies/${company.id}`} className="font-medium hover:underline">
            {company.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {[company.industry, company.city].filter(Boolean).join(' · ')}
            {company.lists[0] ? ` · ${company.lists[0]}` : ''}
          </p>
        </div>
        <span className="text-sm font-semibold shrink-0">{company.fit ? `Fit ${company.fit}` : 'Researching…'}</span>
      </div>
      {company.fitReason && <p className="text-sm">{company.fitReason}</p>}
      {company.research && (
        <details>
          <summary className="text-xs text-muted-foreground cursor-pointer">Research brief</summary>
          <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">{company.research}</p>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {company.website && (
          <a href={/^https?:/i.test(company.website) ? company.website : `https://${company.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
            <Globe className="h-3 w-3" /> Website
          </a>
        )}
        {company.instagram && (
          <a href={instagramUrl(company.instagram)} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
            <Instagram className="h-3 w-3" /> {company.instagram}
          </a>
        )}
        {company.address && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {company.address}
          </span>
        )}
      </div>
      {rejecting ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            placeholder="Why not? (teaches future searches)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && onReject(reason)}
          />
          <Button variant="outline" onClick={() => onReject(reason)}>
            Reject
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={onAccept}>
            <Check className="h-4 w-4 mr-1" /> Accept
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
            <X className="h-4 w-4 mr-1" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Prospecting() {
  const { companies, updateCompany } = useCRMContext();
  const [searches, setSearches] = useState<ProspectSearch[] | null>(null);
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [dialog, setDialog] = useState<{ open: boolean; search: ProspectSearch | null }>({ open: false, search: null });
  const [budget, setBudget] = useState<{ spent: number; budget: number } | null>(null);

  const load = useCallback(() => {
    Promise.all([listSearches(), listRecentJobs(30), getResearchBudget()])
      .then(([loadedSearches, loadedJobs, loadedBudget]) => {
        setSearches(loadedSearches);
        setJobs(loadedJobs);
        setBudget(loadedBudget);
      })
      .catch((error) => toast.error('Could not load prospecting', { description: errorMessage(error) }));
  }, []);
  useEffect(load, [load]);

  const toReview = companies
    .filter((company) => company.needsReview)
    .sort((a, b) => ({ A: 0, B: 1, C: 2 }[a.fit ?? 'C'] ?? 3) - ({ A: 0, B: 1, C: 2 }[b.fit ?? 'C'] ?? 3));

  const runningFor = (searchId: string) =>
    jobs.find((job) => job.search_id === searchId && (job.status === 'queued' || job.status === 'running'));
  const lastResult = (searchId: string) =>
    jobs.find((job) => job.search_id === searchId && (job.status === 'done' || job.status === 'failed'));

  const handleRunNow = async (search: ProspectSearch) => {
    try {
      const queued = await runSearchNow(search.id);
      toast(queued ? 'Search queued' : 'Already running', {
        description: 'New prospects appear below within a few minutes, then get researched one by one.',
      });
      load();
    } catch (error) {
      toast.error('Could not start the search', { description: errorMessage(error) });
    }
  };

  const handleDelete = async (search: ProspectSearch) => {
    if (!window.confirm(`Delete the search "${search.name}"? Companies it found stay.`)) return;
    try {
      await deleteSearch(search.id);
      load();
    } catch (error) {
      toast.error('Could not delete', { description: errorMessage(error) });
    }
  };

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Prospecting</h1>
          <p className="text-muted-foreground">
            Claude searches the web for companies that fit your target customers, researches them, and queues them here
            for your review.
          </p>
          {budget && (
            <p className={`text-xs mt-1 ${budget.spent >= budget.budget ? 'text-destructive-foreground' : 'text-muted-foreground'}`}>
              €{budget.spent.toFixed(2)} of €{budget.budget.toFixed(0)} research budget used this month
              {budget.spent >= budget.budget ? ': paused until next month (raise it in Settings)' : ''}
            </p>
          )}
        </div>
        <Button onClick={() => setDialog({ open: true, search: null })}>
          <Plus className="h-4 w-4 mr-2" />
          New search
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-3">
          <h2 className="font-semibold">To review ({toReview.length})</h2>
          {toReview.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nothing to review. New finds from your searches show up here.
              </CardContent>
            </Card>
          )}
          {toReview.map((company) => (
            <ProspectCard
              key={company.id}
              company={company}
              onAccept={() => {
                updateCompany(company.id, { needsReview: false, lifecycle: 'qualified' });
                toast(`${company.name} accepted`, { description: 'Now in Qualified, ready for a sequence.' });
              }}
              onReject={(reason) =>
                updateCompany(company.id, { needsReview: false, lifecycle: 'disqualified', lostReason: reason.trim() })
              }
            />
          ))}
        </div>

        <div className="lg:col-span-2 space-y-3">
          <h2 className="font-semibold">Searches</h2>
          {searches === null && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {searches?.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Start with one search</CardTitle>
                <CardDescription>
                  For example "Paint & Sip studios" in "Hamburg", 10 a week. Claude skips companies you already have and
                  learns from the ones you reject.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {searches?.map((search) => {
            const running = runningFor(search.id);
            const last = lastResult(search.id);
            return (
              <Card key={search.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{search.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {search.strategy === 'intent' ? 'Buying signals · ' : ''}
                        {search.query}
                        {search.location ? ` · ${search.location}` : ''} · {search.weekly_target}/week
                        {search.active ? '' : ' · paused'}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => setDialog({ open: true, search })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive-foreground" aria-label="Delete" onClick={() => handleDelete(search)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {running
                      ? 'Searching now…'
                      : last?.status === 'failed'
                        ? `Last run failed: ${last.error}`
                        : search.last_run_at
                          ? `Last run ${formatDistanceToNow(new Date(search.last_run_at), { addSuffix: true })}${
                              last?.result?.found !== undefined ? ` · found ${last.result.found}` : ''
                            }`
                          : 'Not run yet'}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => handleRunNow(search)} disabled={!!running}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Run now
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <SearchDialog
        search={dialog.search}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        onSaved={load}
      />
    </div>
  );
}
