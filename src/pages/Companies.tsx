import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Search, Sparkles, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { ESTIMATED_COST_EUR, queueEnrichment } from '@/lib/research';
import { useCRMContext } from '@/contexts/CRMContext';
import { AddCompanyDialog } from '@/components/AddCompanyDialog';
import { LifecycleBadge } from '@/components/LifecycleBadge';
import { StartSequenceDialog } from '@/components/StartSequenceDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { COMPANY_TYPES, LIFECYCLES, type Company, type Lifecycle } from '@/types/crm';

const ALL = 'all';
/** Default view: everything still in play (hides lost, not now, disqualified). */
const ACTIVE = 'active';
const PAGE_SIZE = 100;

const typeLabel = (type: Company['type']) => COMPANY_TYPES.find((entry) => entry.id === type)?.label ?? type;

export default function Companies() {
  const navigate = useNavigate();
  const { companies, contacts, tasks } = useCRMContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [sequenceOpen, setSequenceOpen] = useState(false);

  const stageFilter = searchParams.get('stage') ?? ACTIVE;
  const typeFilter = searchParams.get('type') ?? ALL;
  const listFilter = searchParams.get('list') ?? ALL;
  const fitFilter = searchParams.get('fit') ?? ALL;

  const setFilter = (key: string, value: string, defaultValue: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
    setLimit(PAGE_SIZE);
  };

  const allLists = useMemo(
    () => [...new Set(companies.flatMap((company) => company.lists))].sort((a, b) => a.localeCompare(b)),
    [companies],
  );

  const peopleByCompany = useMemo(() => {
    const map = new Map<string, string[]>();
    contacts.forEach((contact) => {
      if (!contact.companyId) return;
      map.set(contact.companyId, [...(map.get(contact.companyId) ?? []), contact.fullName]);
    });
    return map;
  }, [contacts]);

  const nextTaskByCompany = useMemo(() => {
    const map = new Map<string, string>();
    tasks
      .filter((task) => !task.completed && task.companyId)
      .forEach((task) => {
        const current = map.get(task.companyId!);
        if (!current || task.dueDate < current) map.set(task.companyId!, task.dueDate);
      });
    return map;
  }, [tasks]);

  const exitStages = new Set(LIFECYCLES.filter((stage) => stage.exit).map((stage) => stage.id));

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return companies
      .filter((company) => {
        if (stageFilter === ACTIVE && exitStages.has(company.lifecycle)) return false;
        if (stageFilter !== ACTIVE && stageFilter !== ALL && company.lifecycle !== stageFilter) return false;
        if (typeFilter !== ALL && company.type !== typeFilter) return false;
        if (listFilter !== ALL && !company.lists.includes(listFilter)) return false;
        if (fitFilter !== ALL && (company.fit ?? 'none') !== fitFilter) return false;
        if (!query) return true;
        const people = peopleByCompany.get(company.id) ?? [];
        return [company.name, company.city, company.industry, ...people].some((value) =>
          value.toLowerCase().includes(query),
        );
      })
      .sort((a, b) => {
        // Furthest along first, then most recently active.
        const stageOrder = (lifecycle: Lifecycle) => LIFECYCLES.findIndex((stage) => stage.id === lifecycle);
        const byStage = stageOrder(b.lifecycle) - stageOrder(a.lifecycle);
        if (exitStages.has(a.lifecycle) !== exitStages.has(b.lifecycle)) return exitStages.has(a.lifecycle) ? 1 : -1;
        if (byStage !== 0) return byStage;
        return (b.lastActivityAt ?? b.createdAt).localeCompare(a.lastActivityAt ?? a.createdAt);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, search, stageFilter, typeFilter, listFilter, fitFilter, peopleByCompany]);

  const unresearched = filtered.filter(
    (company) => !company.enrichedAt || Date.now() - new Date(company.enrichedAt).getTime() > 30 * 86_400_000,
  );

  const handleResearch = async () => {
    const cost = (unresearched.length * ESTIMATED_COST_EUR.enrich).toFixed(0);
    if (!window.confirm(`Research ${unresearched.length} companies with AI? Roughly €${cost}, about one company per minute in the background.`)) return;
    try {
      const queued = await queueEnrichment(unresearched.map((company) => company.id));
      toast(`Queued ${queued} for research`, { description: 'Results fill in over the next minutes; you can keep working.' });
    } catch (error) {
      toast.error('Could not queue research', { description: error instanceof Error ? error.message : String(error) });
    }
  };

  const nextStep = (company: Company) => {
    const taskDate = nextTaskByCompany.get(company.id);
    if (taskDate) return `Task ${taskDate}`;
    if (company.nextActionAt) return `${company.nextAction ?? 'Call'} ${company.nextActionAt.slice(0, 10)}`;
    return '—';
  };

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Companies</h1>
          <p className="text-muted-foreground">
            {filtered.length} of {companies.length}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={unresearched.length === 0}
            onClick={handleResearch}
            title="Research every company in this filtered list that hasn't been researched in the last 30 days"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Research ({unresearched.length})
          </Button>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() => setSequenceOpen(true)}
            title="Start a sequence for every company in this filtered list"
          >
            <Workflow className="h-4 w-4 mr-2" />
            Start sequence ({filtered.length})
          </Button>
          <AddCompanyDialog defaultList={listFilter !== ALL ? listFilter : undefined} />
        </div>
      </div>
      <StartSequenceDialog open={sequenceOpen} onOpenChange={setSequenceOpen} companies={filtered} />

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, city, industry or person…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:w-[640px]">
          <Select value={stageFilter} onValueChange={(value) => setFilter('stage', value, ACTIVE)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ACTIVE}>Active stages</SelectItem>
              <SelectItem value={ALL}>All stages</SelectItem>
              {LIFECYCLES.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(value) => setFilter('type', value, ALL)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {COMPANY_TYPES.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={listFilter} onValueChange={(value) => setFilter('list', value, ALL)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All lists</SelectItem>
              {allLists.map((list) => (
                <SelectItem key={list} value={list}>
                  {list}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fitFilter} onValueChange={(value) => setFilter('fit', value, ALL)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any fit</SelectItem>
              <SelectItem value="A">Fit A</SelectItem>
              <SelectItem value="B">Fit B</SelectItem>
              <SelectItem value="C">Fit C</SelectItem>
              <SelectItem value="none">No fit yet</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border">
          <p className="text-muted-foreground">
            {companies.length === 0 ? 'No companies yet. Add one or import a CSV in Call Mode.' : 'Nothing matches these filters.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {filtered.slice(0, limit).map((company) => (
              <button
                key={company.id}
                onClick={() => navigate(`/companies/${company.id}`)}
                className="w-full text-left rounded-xl border bg-card p-4 shadow-sm hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{company.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[typeLabel(company.type), company.city, company.industry].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <LifecycleBadge lifecycle={company.lifecycle} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Next: {nextStep(company)}</p>
              </button>
            ))}
          </div>

          <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Fit</TableHead>
                  <TableHead>People</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead>Next</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, limit).map((company) => {
                  const people = peopleByCompany.get(company.id) ?? [];
                  return (
                    <TableRow
                      key={company.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/companies/${company.id}`)}
                    >
                      <TableCell>
                        <p className="font-medium">{company.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[typeLabel(company.type), company.city, company.industry].filter(Boolean).join(' · ')}
                        </p>
                      </TableCell>
                      <TableCell>
                        <LifecycleBadge lifecycle={company.lifecycle} />
                      </TableCell>
                      <TableCell className="text-sm">{company.fit ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                        {people.length ? people.join(', ') : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {company.lastActivityAt
                          ? formatDistanceToNow(new Date(company.lastActivityAt), { addSuffix: true })
                          : 'Never'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{nextStep(company)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {filtered.length > limit && (
            <div className="flex justify-center">
              <button
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
              >
                Show more ({filtered.length - limit} left)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
