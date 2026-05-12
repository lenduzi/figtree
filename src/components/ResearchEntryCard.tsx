import { useEffect, useState } from 'react';
import { ResearchEntry, ResearchPriority } from '@/types/crm';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2, UserPlus, ExternalLink, ChevronDown, Plus } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { appendIntelSnippet, getLatestIntelSnippet, parseIntelLog } from '@/lib/dream-client-intel';

interface ResearchEntryCardProps {
  entry: ResearchEntry;
  onPromote: (entryId: string) => void;
  highlightPriority?: boolean;
  autoOpenEdit?: boolean;
  onAutoFocusHandled?: () => void;
}

export function ResearchEntryCard({
  entry,
  onPromote,
  highlightPriority,
  autoOpenEdit,
  onAutoFocusHandled,
}: ResearchEntryCardProps) {
  const { updateResearchEntry, deleteResearchEntry, getContactById } = useCRMContext();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [intelDraft, setIntelDraft] = useState('');
  const [editForm, setEditForm] = useState({
    company: entry.company || '',
    poc: entry.poc || '',
    email: entry.email || '',
  });

  const linkedContact = entry.linkedContactId ? getContactById(entry.linkedContactId) : null;
  const intelSnippets = parseIntelLog(entry.notes);
  const latestIntel = getLatestIntelSnippet(entry.notes);

  const openEdit = () => {
    setEditForm({
      company: entry.company || '',
      poc: entry.poc || '',
      email: entry.email || '',
    });
    setEditOpen(true);
  };

  useEffect(() => {
    if (!autoOpenEdit) return;
    setEditForm({
      company: entry.company || '',
      poc: entry.poc || '',
      email: entry.email || '',
    });
    setEditOpen(true);
    onAutoFocusHandled?.();
  }, [autoOpenEdit, entry.company, entry.poc, entry.email, onAutoFocusHandled]);

  const handleSave = () => {
    updateResearchEntry(entry.id, {
      company: editForm.company,
      poc: editForm.poc,
      email: editForm.email,
    });
    setEditOpen(false);
  };

  const handleAddIntel = () => {
    const nextNotes = appendIntelSnippet(entry.notes, intelDraft);
    if (nextNotes === entry.notes) return;
    updateResearchEntry(entry.id, { notes: nextNotes });
    setIntelDraft('');
    setIsExpanded(true);
  };

  const priorityCardClasses: Record<ResearchPriority, string> = {
    high: 'bg-emerald-50/70 border-emerald-200/70 dark:bg-emerald-950/35 dark:border-emerald-900/50',
    medium: 'bg-amber-50/70 border-amber-200/70 dark:bg-amber-950/30 dark:border-amber-900/45',
    low: 'bg-rose-50/70 border-rose-200/70 dark:bg-rose-950/30 dark:border-rose-900/45',
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm",
        highlightPriority && priorityCardClasses[entry.priority],
        highlightPriority && "priority-card",
        highlightPriority && `priority-${entry.priority}`,
      )}
    >
      <button
        type="button"
        className="w-full text-left p-4"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-foreground truncate">
              {entry.company || 'Add company'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {latestIntel?.text || 'No intel yet'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {entry.status === 'promoted' && linkedContact ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/contacts/${linkedContact.id}`);
                }}
              >
                Linked <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            ) : null}
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
          </div>
        </div>
      </button>

      <div className="px-4 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={entry.priority}
            onValueChange={(value: ResearchPriority) =>
              updateResearchEntry(entry.id, { priority: value })
            }
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={openEdit}>
            Edit
          </Button>
          {entry.status === 'promoted' && linkedContact ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => navigate(`/contacts/${linkedContact.id}`)}
            >
              Linked <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {entry.status !== 'promoted' && (
                <DropdownMenuItem onClick={() => onPromote(entry.id)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Promote to Contact
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => deleteResearchEntry(entry.id)}
                className="text-destructive-foreground"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border px-4 py-3 space-y-3 text-sm">
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">POC</span>
              <span className="text-right text-foreground">{entry.poc || '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Email</span>
              <span className="text-right text-foreground">{entry.email || '—'}</span>
            </div>
          </div>
          <div className="space-y-2 rounded-xl border bg-background/80 p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Add Intel</p>
              <p className="text-xs text-muted-foreground">Append a quick snippet instead of overwriting notes.</p>
            </div>
            <Textarea
              value={intelDraft}
              onChange={(event) => setIntelDraft(event.target.value)}
              placeholder='Example: Ariana said their in-house team reached out directly.'
              className="min-h-[88px] resize-none"
            />
            <Button onClick={handleAddIntel} disabled={!intelDraft.trim()} size="sm" className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add Intel
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Intel Timeline</p>
            {intelSnippets.length > 0 ? (
              <div className="space-y-2">
                {[...intelSnippets].reverse().map((snippet, index) => (
                  <div key={`${snippet.timestampLabel ?? 'legacy'}-${index}`} className="rounded-lg border bg-muted/30 px-3 py-2">
                    {snippet.timestampLabel ? (
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        {snippet.timestampLabel}
                      </p>
                    ) : null}
                    <p className="text-sm leading-6 text-foreground">{snippet.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No intel logged yet.</p>
            )}
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Dream Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`company-${entry.id}`}>Company</Label>
              <Input
                id={`company-${entry.id}`}
                value={editForm.company}
                onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                placeholder="Company name"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`poc-${entry.id}`}>POC</Label>
              <Input
                id={`poc-${entry.id}`}
                value={editForm.poc}
                onChange={(e) => setEditForm({ ...editForm, poc: e.target.value })}
                placeholder="Point of contact"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`email-${entry.id}`}>Email</Label>
              <Input
                id={`email-${entry.id}`}
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="name@company.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
