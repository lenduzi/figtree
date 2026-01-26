import { useEffect, useState } from 'react';
import { ResearchEntry, ResearchPriority, ResearchStatus } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2, UserPlus, ExternalLink, ChevronDown } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

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
  const [editForm, setEditForm] = useState({
    company: entry.company || '',
    poc: entry.poc || '',
    email: entry.email || '',
    industry: entry.industry || '',
  });

  const linkedContact = entry.linkedContactId ? getContactById(entry.linkedContactId) : null;

  const openEdit = () => {
    setEditForm({
      company: entry.company || '',
      poc: entry.poc || '',
      email: entry.email || '',
      industry: entry.industry || '',
    });
    setEditOpen(true);
  };

  useEffect(() => {
    if (!autoOpenEdit) return;
    setEditForm({
      company: entry.company || '',
      poc: entry.poc || '',
      email: entry.email || '',
      industry: entry.industry || '',
    });
    setEditOpen(true);
    onAutoFocusHandled?.();
  }, [autoOpenEdit, entry.company, entry.poc, entry.email, entry.industry, onAutoFocusHandled]);

  const handleSave = () => {
    updateResearchEntry(entry.id, {
      company: editForm.company,
      poc: editForm.poc,
      email: editForm.email,
      industry: editForm.industry,
    });
    setEditOpen(false);
  };

  const statusColors: Record<ResearchStatus, string> = {
    researching: 'bg-muted text-muted-foreground',
    ready: 'bg-accent text-accent-foreground',
    promoted: 'bg-primary text-primary-foreground',
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
              {entry.industry || 'No industry'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusColors[entry.status]}>{entry.status}</Badge>
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
        <div className="border-t border-border px-4 py-3 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">POC</span>
            <span className="text-foreground">{entry.poc || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="text-foreground">{entry.email || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Industry</span>
            <span className="text-foreground">{entry.industry || '—'}</span>
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
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
            <div className="space-y-1">
              <Label htmlFor={`industry-${entry.id}`}>Industry</Label>
              <Input
                id={`industry-${entry.id}`}
                value={editForm.industry}
                onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                placeholder="Industry"
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
