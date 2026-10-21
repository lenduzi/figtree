import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  BRAIN_SECTIONS,
  createBrainEntry,
  deleteBrainEntry,
  deleteBrainFile,
  listBrainEntries,
  listBrainFiles,
  updateBrainEntry,
  updateBrainFileDescription,
  uploadBrainFile,
  type BrainEntry,
  type BrainFile,
  type BrainSection,
} from '@/lib/brain';
import { formatFileSize, MAX_ATTACHMENTS_BYTES } from '@/lib/gmail';

const SAVE_DELAY_MS = 800;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function EntryEditor({
  entry,
  onChange,
  onDelete,
}: {
  entry: BrainEntry;
  onChange: (changes: Partial<Pick<BrainEntry, 'title' | 'content'>>) => void;
  onDelete: () => void;
}) {
  const rows = Math.min(24, Math.max(3, entry.content.split('\n').length + 1));
  return (
    <div className="rounded-lg border border-border p-3 space-y-2 group">
      <div className="flex items-center gap-2">
        <Input
          value={entry.title}
          placeholder="Title"
          className="font-medium border-0 shadow-none px-0 h-8 focus-visible:ring-0"
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive-foreground"
          aria-label="Delete entry"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Textarea
        value={entry.content}
        rows={rows}
        placeholder="Write it the way you'd explain it to a new teammate."
        className="text-sm resize-y"
        onChange={(event) => onChange({ content: event.target.value })}
      />
    </div>
  );
}

export default function Brain() {
  const [entries, setEntries] = useState<BrainEntry[] | null>(null);
  const [files, setFiles] = useState<BrainFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [savingCount, setSavingCount] = useState(0);
  const saveTimers = useRef(new Map<string, number>());
  const pendingChanges = useRef(new Map<string, Partial<Pick<BrainEntry, 'title' | 'content'>>>());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    Promise.all([listBrainEntries(), listBrainFiles()])
      .then(([loadedEntries, loadedFiles]) => {
        setEntries(loadedEntries);
        setFiles(loadedFiles);
      })
      .catch((error) => toast.error('Could not load the brain', { description: errorMessage(error) }));
  }, []);

  const flush = useCallback(async (id: string) => {
    const changes = pendingChanges.current.get(id);
    pendingChanges.current.delete(id);
    saveTimers.current.delete(id);
    if (!changes) return;
    setSavingCount((count) => count + 1);
    try {
      await updateBrainEntry(id, changes);
    } catch (error) {
      toast.error('Could not save', { description: errorMessage(error) });
    } finally {
      setSavingCount((count) => count - 1);
    }
  }, []);

  // Save anything still pending when leaving the page.
  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      timers.forEach((timer, id) => {
        window.clearTimeout(timer);
        flush(id);
      });
    };
  }, [flush]);

  const handleChange = (id: string, changes: Partial<Pick<BrainEntry, 'title' | 'content'>>) => {
    setEntries((current) => current?.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) ?? current);
    pendingChanges.current.set(id, { ...pendingChanges.current.get(id), ...changes });
    window.clearTimeout(saveTimers.current.get(id));
    saveTimers.current.set(id, window.setTimeout(() => flush(id), SAVE_DELAY_MS));
  };

  const handleAdd = async (section: BrainSection) => {
    try {
      const sectionEntries = entries?.filter((entry) => entry.section === section) ?? [];
      const nextOrder = sectionEntries.reduce((max, entry) => Math.max(max, entry.sort_order), -1) + 1;
      const created = await createBrainEntry(section, nextOrder);
      setEntries((current) => [...(current ?? []), created]);
    } catch (error) {
      toast.error('Could not add an entry', { description: errorMessage(error) });
    }
  };

  const handleDelete = async (entry: BrainEntry) => {
    if ((entry.title || entry.content) && !window.confirm(`Delete "${entry.title || 'this entry'}"?`)) return;
    window.clearTimeout(saveTimers.current.get(entry.id));
    pendingChanges.current.delete(entry.id);
    try {
      await deleteBrainEntry(entry.id);
      setEntries((current) => current?.filter((item) => item.id !== entry.id) ?? current);
    } catch (error) {
      toast.error('Could not delete', { description: errorMessage(error) });
    }
  };

  const handleUpload = async (selected: FileList | null) => {
    if (!selected?.length) return;
    const tooLarge = Array.from(selected).find((file) => file.size > MAX_ATTACHMENTS_BYTES);
    if (tooLarge) {
      toast.error(`${tooLarge.name} is larger than 25 MB`, { description: 'Gmail could not send it as an attachment.' });
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(selected)) {
        const uploaded = await uploadBrainFile(file);
        setFiles((current) => [...current, uploaded]);
      }
    } catch (error) {
      toast.error('Upload failed', { description: errorMessage(error) });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (file: BrainFile) => {
    if (!window.confirm(`Delete ${file.filename}?`)) return;
    try {
      await deleteBrainFile(file);
      setFiles((current) => current.filter((item) => item.id !== file.id));
    } catch (error) {
      toast.error('Could not delete the file', { description: errorMessage(error) });
    }
  };

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Company Brain</h1>
          <p className="text-muted-foreground">
            Everything Claude knows about your business. Every email draft uses all of it, so keep it current.
          </p>
        </div>
        <span className="text-xs text-muted-foreground pt-2 shrink-0">
          {savingCount > 0 ? 'Saving…' : entries ? 'All changes saved' : ''}
        </span>
      </div>

      {!entries ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        BRAIN_SECTIONS.map((section) => {
          const sectionEntries = entries
            .filter((entry) => entry.section === section.id)
            .sort((a, b) => a.sort_order - b.sort_order);
          return (
            <Card key={section.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{section.title}</CardTitle>
                <CardDescription>{section.hint}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sectionEntries.map((entry) => (
                  <EntryEditor
                    key={entry.id}
                    entry={entry}
                    onChange={(changes) => handleChange(entry.id, changes)}
                    onDelete={() => handleDelete(entry)}
                  />
                ))}
                <Button variant="ghost" size="sm" onClick={() => handleAdd(section.id)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add entry
                </Button>
              </CardContent>
            </Card>
          );
        })
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Files</CardTitle>
          <CardDescription>
            Pitch deck, one-pagers, price lists. Claude suggests attaching them when a contact asks for material.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {files.map((file) => (
            <div key={file.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate flex-1">{file.filename}</span>
                <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(file.size)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive-foreground"
                  aria-label={`Delete ${file.filename}`}
                  onClick={() => handleDeleteFile(file)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                defaultValue={file.description}
                placeholder="What is it, and when should it be sent? e.g. 'Deck for venues, send after a first call'"
                className="text-sm"
                onBlur={(event) => {
                  const description = event.target.value.trim();
                  if (description === file.description) return;
                  updateBrainFileDescription(file.id, description)
                    .then(() =>
                      setFiles((current) => current.map((item) => (item.id === file.id ? { ...item, description } : item))),
                    )
                    .catch((error) => toast.error('Could not save', { description: errorMessage(error) }));
                }}
              />
            </div>
          ))}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => handleUpload(event.target.files)}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {uploading ? 'Uploading…' : 'Upload files'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
