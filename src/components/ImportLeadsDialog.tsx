import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useCRMContext } from '@/contexts/CRMContext';
import { waitForWrites } from '@/lib/db';
import { ESTIMATED_COST_EUR, queueEnrichment } from '@/lib/research';
import {
  dedupeTargets,
  findHeaderRow,
  guessMapping,
  mapColumnsWithClaude,
  planImport,
  readLeadFile,
  TARGETS,
  type Sheet,
  type Target,
} from '@/lib/lead-import';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COMPANY_TYPES, type CompanyType } from '@/types/crm';

const ACCEPT = '.xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GROUPS = ['Company', 'Person', 'Other'] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A file dropped onto the page, read as soon as the dialog opens. */
  initialFile?: File | null;
};

export function ImportLeadsDialog({ open, onOpenChange, initialFile }: Props) {
  const { companies, contacts, stages, addCompanies, addContacts, updateCompany } = useCRMContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Target[]>([]);
  const [claudeState, setClaudeState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const [listName, setListName] = useState('');
  const [companyType, setCompanyType] = useState<CompanyType>('other');
  const [reviewFirst, setReviewFirst] = useState(true);
  const [research, setResearch] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  // Bumped on every new file/sheet so a slow Claude answer can't overwrite a newer table.
  const runRef = useRef(0);
  const touchedRef = useRef(false);

  const sheet = sheets[sheetIndex];
  const headerRow = useMemo(() => (sheet ? findHeaderRow(sheet.rows) : 0), [sheet]);
  const headers = useMemo(() => {
    if (!sheet) return [];
    const width = Math.max(0, ...sheet.rows.map((row) => row.length));
    return Array.from({ length: width }, (_, i) => sheet.rows[headerRow]?.[i] ?? '');
  }, [sheet, headerRow]);
  const dataRows = useMemo(() => (sheet ? sheet.rows.slice(headerRow + 1).filter((row) => row.some(Boolean)) : []), [sheet, headerRow]);

  const plan = useMemo(
    () => (mapping.length ? planImport(headers, dataRows, mapping, companies, contacts) : null),
    [headers, dataRows, mapping, companies, contacts],
  );
  const freshPeople = plan?.fresh.reduce((sum, company) => sum + company.people.length, 0) ?? 0;
  const existingPeople = plan?.existing.reduce((sum, entry) => sum + entry.people.length, 0) ?? 0;

  const reset = () => {
    runRef.current += 1;
    setFileName('');
    setSheets([]);
    setSheetIndex(0);
    setMapping([]);
    setClaudeState('idle');
    setResearch(false);
    setReviewFirst(true);
    setCompanyType('other');
  };

  const mapSheet = async (next: Sheet) => {
    const run = ++runRef.current;
    touchedRef.current = false;
    const start = findHeaderRow(next.rows);
    const width = Math.max(0, ...next.rows.map((row) => row.length));
    const nextHeaders = Array.from({ length: width }, (_, i) => next.rows[start]?.[i] ?? '');
    const guess = guessMapping(nextHeaders);
    setMapping(guess.mapping);
    if (!guess.unsure) {
      setClaudeState('idle');
      return;
    }
    setClaudeState('working');
    try {
      const samples = next.rows.slice(start + 1).filter((row) => row.some(Boolean)).slice(0, 5);
      const claude = await mapColumnsWithClaude(nextHeaders, samples);
      if (run !== runRef.current) return;
      // Your own changes win over Claude's.
      if (!touchedRef.current) setMapping(claude);
      setClaudeState('done');
    } catch (error) {
      if (run !== runRef.current) return;
      console.warn('Figtree: Claude column mapping failed', error);
      setClaudeState('failed');
    }
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    try {
      const read = await readLeadFile(file);
      if (read.length === 0) {
        toast.error('That file looks empty');
        return;
      }
      setFileName(file.name);
      setListName(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
      setSheets(read);
      setSheetIndex(0);
      await mapSheet(read[0]);
    } catch (error) {
      toast.error('Could not read the file', { description: error instanceof Error ? error.message : String(error) });
    }
  };

  useEffect(() => {
    if (open && initialFile) void handleFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  const setTarget = (index: number, target: Target) => {
    touchedRef.current = true;
    setMapping((current) => {
      // Moving a one-off field here frees it up elsewhere.
      const next = current.map((value, i) => (i !== index && value === target && !['notes', 'ignore', 'company.fitReason'].includes(target) ? 'notes' : value));
      next[index] = target;
      return dedupeTargets(next);
    });
  };

  const handleImport = async () => {
    if (!plan) return;
    setImporting(true);
    const list = listName.trim();
    const now = new Date().toISOString();
    const created = addCompanies(
      plan.fresh.map((draft) => ({
        name: draft.name,
        type: companyType,
        website: draft.website,
        email: draft.email,
        phone: draft.phone,
        city: draft.city,
        address: draft.address,
        industry: draft.industry,
        instagram: draft.instagram,
        googleMapsUrl: draft.googleMapsUrl,
        fitReason: draft.fitReason,
        notes: draft.notes,
        lifecycle: 'sourced' as const,
        needsReview: reviewFirst,
        source: `import: ${fileName}`.slice(0, 200),
        lists: list ? [list] : [],
        nextAction: draft.phone ? 'Call' : null,
        nextActionAt: draft.phone ? now : null,
      })),
    );

    const stageId = stages[0]?.id ?? '';
    const people = [
      ...plan.fresh.flatMap((draft, i) => draft.people.map((person) => ({ person, company: created[i] }))),
      ...plan.existing.flatMap((entry) => entry.people.map((person) => ({ person, company: entry.company }))),
    ];
    addContacts(
      people.map(({ person, company }) => ({
        companyId: company.id,
        company: company.name,
        website: company.website,
        fullName: person.fullName,
        role: person.role,
        email: person.email,
        phone: person.phone,
        stageId,
        notes: person.linkedin ? `LinkedIn: ${person.linkedin}` : '',
      })),
    );
    if (list) {
      plan.existing
        .filter((entry) => !entry.company.lists.includes(list))
        .forEach((entry) => updateCompany(entry.company.id, { lists: [...entry.company.lists, list] }));
    }

    const parts = [`${created.length} new companies`];
    if (people.length) parts.push(`${people.length} ${people.length === 1 ? 'person' : 'people'}`);
    if (plan.existing.length) parts.push(`${plan.existing.length} already known`);
    toast('Import complete', {
      description: `${parts.join(', ')}.${reviewFirst && created.length ? ' New ones are waiting in Prospecting → Review.' : ''}`,
    });

    if (research && created.length) {
      try {
        // Rows are saved by an effect after this render; wait for them before queueing.
        await new Promise((resolve) => setTimeout(resolve, 300));
        await waitForWrites();
        const queued = await queueEnrichment(created.map((company) => company.id));
        toast(`Queued ${queued} for research`, { description: 'Results fill in over the next minutes.' });
      } catch (error) {
        toast.error('Imported, but research could not be queued', {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    }
    setImporting(false);
    reset();
    onOpenChange(false);
  };

  const sample = (index: number) => dataRows.map((row) => row[index]).find(Boolean) ?? '';
  const researchCost = Math.max(1, Math.round((plan?.fresh.length ?? 0) * ESTIMATED_COST_EUR.enrich));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !importing) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import lead list</DialogTitle>
          <DialogDescription>
            An .xlsx or .csv from Claude, ChatGPT or anywhere else. Columns are matched automatically, rows of the
            same company are merged with their people, and companies you already have are skipped.
          </DialogDescription>
        </DialogHeader>

        {!sheet ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFile(event.dataTransfer.files?.[0]);
            }}
            className={`w-full rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Drop a file here or click to choose</p>
            <p className="text-sm text-muted-foreground">.xlsx, .csv or .tsv</p>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium truncate max-w-[260px]">{fileName}</span>
              {sheets.length > 1 && (
                <Select
                  value={String(sheetIndex)}
                  onValueChange={(value) => {
                    setSheetIndex(Number(value));
                    void mapSheet(sheets[Number(value)]);
                  }}
                >
                  <SelectTrigger className="h-8 w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((entry, i) => (
                      <SelectItem key={entry.name + i} value={String(i)}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span className="text-muted-foreground">{dataRows.length} rows</span>
              <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={reset}>
                Choose another file
              </Button>
            </div>

            <div className="rounded-lg border">
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
                <span>Columns</span>
                {claudeState === 'working' && (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Claude is checking the columns…
                  </span>
                )}
                {claudeState === 'done' && (
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Matched by Claude
                  </span>
                )}
                {claudeState === 'failed' && <span>Claude unavailable; check the guesses below</span>}
              </div>
              <div className="divide-y max-h-[300px] overflow-y-auto">
                {headers.map((header, index) => (
                  <div key={index} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1fr_200px] items-center gap-2 px-3 py-2">
                    <p className="text-sm font-medium truncate" title={header}>
                      {header || <span className="text-muted-foreground">Column {index + 1}</span>}
                    </p>
                    <p className="hidden sm:block text-xs text-muted-foreground truncate" title={sample(index)}>
                      {sample(index) || '—'}
                    </p>
                    <Select value={mapping[index] ?? 'notes'} onValueChange={(value) => setTarget(index, value as Target)}>
                      <SelectTrigger className="h-8 w-[170px] sm:w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GROUPS.map((group) => (
                          <SelectGroup key={group}>
                            <SelectLabel>{group}</SelectLabel>
                            {TARGETS.filter((target) => target.group === group).map((target) => (
                              <SelectItem key={target.id} value={target.id}>
                                {target.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {plan && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <p>
                  <span className="font-medium">{plan.fresh.length} new companies</span>
                  {freshPeople > 0 && ` with ${freshPeople} ${freshPeople === 1 ? 'person' : 'people'}`}
                  {plan.existing.length > 0 && ` · ${plan.existing.length} already in Figtree`}
                  {existingPeople > 0 && ` (${existingPeople} new ${existingPeople === 1 ? 'person' : 'people'} added to them)`}
                  {plan.skipped > 0 && ` · ${plan.skipped} ${plan.skipped === 1 ? 'row' : 'rows'} without a company name`}
                </p>
                {!mapping.includes('company.name') && !mapping.includes('company.website') && (
                  <p className="text-destructive">Pick which column holds the company name.</p>
                )}
                {plan.fresh.length > 0 && (
                  <p className="text-muted-foreground truncate">
                    {plan.fresh.slice(0, 6).map((company) => company.name).join(', ')}
                    {plan.fresh.length > 6 ? ', …' : ''}
                  </p>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="import-list">Add them to list</Label>
                <Input id="import-list" value={listName} onChange={(event) => setListName(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Company type</Label>
                <Select value={companyType} onValueChange={(value) => setCompanyType(value as CompanyType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_TYPES.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={reviewFirst} onCheckedChange={(value) => setReviewFirst(value === true)} className="mt-0.5" />
                <span>
                  Review them first
                  <span className="block text-xs text-muted-foreground">
                    New companies wait in Prospecting → Review until you accept or reject them.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={research} onCheckedChange={(value) => setResearch(value === true)} className="mt-0.5" />
                <span>
                  Research new companies with AI
                  <span className="block text-xs text-muted-foreground">
                    Roughly €{researchCost} for {plan?.fresh.length ?? 0}, within your monthly research budget.
                  </span>
                </span>
              </label>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!plan || importing || (plan.fresh.length === 0 && existingPeople === 0)}
          >
            {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import {plan ? plan.fresh.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
