import { useState, useRef } from 'react';
import { Edit2, Check, X, ChevronDown } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Activity, Contact, DEFAULT_STAGES, ResearchEntry, ResearchList, Stage, Task } from '@/types/crm';

const STORAGE_KEYS = {
  contacts: 'simplecrm_contacts',
  tasks: 'simplecrm_tasks',
  stages: 'simplecrm_stages',
  activities: 'simplecrm_activities',
  researchLists: 'simplecrm_research_lists',
  researchEntries: 'simplecrm_research_entries',
};

type CRMBackup = {
  schemaVersion: number;
  exportedAt: string;
  app: string;
  data: {
    contacts: Contact[];
    tasks: Task[];
    activities: Activity[];
    researchEntries: ResearchEntry[];
    settings?: {
      stages?: Stage[];
      researchLists?: ResearchList[];
    };
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const validateBackup = (value: unknown): { ok: true; data: CRMBackup } | { ok: false; error: string } => {
  if (!isRecord(value)) {
    return { ok: false, error: 'Backup file is not a valid JSON object.' };
  }

  if (value.schemaVersion !== 1) {
    return { ok: false, error: 'Unsupported backup version.' };
  }

  if (value.app !== 'solo-crm') {
    return { ok: false, error: 'This backup file is not for this app.' };
  }

  if (typeof value.exportedAt !== 'string') {
    return { ok: false, error: 'Backup metadata is missing or invalid.' };
  }

  if (!isRecord(value.data)) {
    return { ok: false, error: 'Backup data section is missing.' };
  }

  const data = value.data as Record<string, unknown>;

  if (!Array.isArray(data.contacts)) {
    return { ok: false, error: 'Contacts data is missing or invalid.' };
  }
  if (!Array.isArray(data.tasks)) {
    return { ok: false, error: 'Tasks data is missing or invalid.' };
  }
  if (!Array.isArray(data.activities)) {
    return { ok: false, error: 'Activities data is missing or invalid.' };
  }
  if (!Array.isArray(data.researchEntries)) {
    return { ok: false, error: 'Research entries data is missing or invalid.' };
  }

  if (data.settings !== undefined) {
    if (!isRecord(data.settings)) {
      return { ok: false, error: 'Settings data is invalid.' };
    }
    const settings = data.settings as Record<string, unknown>;
    if (settings.stages !== undefined && !Array.isArray(settings.stages)) {
      return { ok: false, error: 'Stages data is invalid.' };
    }
    if (settings.researchLists !== undefined && !Array.isArray(settings.researchLists)) {
      return { ok: false, error: 'Research lists data is invalid.' };
    }
  }

  return { ok: true, data: value as CRMBackup };
};

export default function Settings() {
  const {
    stages,
    updateStage,
    reorderStages,
    contacts,
    tasks,
    activities,
    researchEntries,
    researchLists,
  } = useCRMContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [dataOpen, setDataOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<CRMBackup | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditValue(name);
  };

  const handleSaveEdit = () => {
    if (editingId && editValue.trim()) {
      updateStage(editingId, { name: editValue.trim() });
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const moveStage = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sortedStages.length) return;

    const newStages = [...sortedStages];
    [newStages[index], newStages[newIndex]] = [newStages[newIndex], newStages[index]];
    reorderStages(newStages);
  };

  const handleExport = () => {
    const backup: CRMBackup = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: 'solo-crm',
      data: {
        contacts,
        tasks,
        activities,
        researchEntries,
        settings: {
          stages,
          researchLists,
        },
      },
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `crm-backup-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = validateBackup(parsed);
      if (!validation.ok) {
        toast.error(validation.error);
        return;
      }
      setPendingImport(validation.data);
      setConfirmOpen(true);
    } catch {
      toast.error('Unable to read that file. Please choose a valid JSON backup.');
    }
  };

  const applyImport = () => {
    if (!pendingImport) return;
    const settings = pendingImport.data.settings ?? {};
    const stagesToUse = settings.stages ?? DEFAULT_STAGES;
    const researchListsToUse = settings.researchLists ?? [];

    try {
      localStorage.setItem(STORAGE_KEYS.contacts, JSON.stringify(pendingImport.data.contacts));
      localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(pendingImport.data.tasks));
      localStorage.setItem(STORAGE_KEYS.activities, JSON.stringify(pendingImport.data.activities));
      localStorage.setItem(STORAGE_KEYS.researchEntries, JSON.stringify(pendingImport.data.researchEntries));
      localStorage.setItem(STORAGE_KEYS.stages, JSON.stringify(stagesToUse));
      localStorage.setItem(STORAGE_KEYS.researchLists, JSON.stringify(researchListsToUse));
      setConfirmOpen(false);
      setPendingImport(null);
      window.location.reload();
    } catch {
      toast.error('Import failed. Please try again with a valid backup file.');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="sr-only sm:not-sr-only text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Customize your CRM</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Stages</CardTitle>
          <CardDescription>
            Rename and reorder your pipeline stages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sortedStages.map((stage, index) => (
              <div
                key={stage.id}
                className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveStage(index, 'up')}
                    disabled={index === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveStage(index, 'down')}
                    disabled={index === sortedStages.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                
                <div
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />

                {editingId === stage.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-8"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveEdit}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 font-medium">{stage.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleStartEdit(stage.id, stage.name)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>About SimpleCRM</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>A lightweight personal CRM to manage contacts, track client stages, and never forget follow-ups.</p>
          <p className="mt-2">All data is stored locally in your browser.</p>
        </CardContent>
      </Card>

      <Collapsible open={dataOpen} onOpenChange={setDataOpen}>
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Data (Advanced)</CardTitle>
              <CardDescription>Export or restore your local CRM data.</CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ChevronDown className={`h-4 w-4 transition-transform ${dataOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  Export Backup
                </Button>
                <Button variant="outline" size="sm" onClick={handleImportClick}>
                  Import Backup
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace local data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current local data. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingImport(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyImport}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
