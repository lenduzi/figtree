import { Fragment, useEffect, useState } from 'react';
import { ResearchEntry, ResearchPriority } from '@/types/crm';
import { TableCell, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

interface ResearchEntryRowProps {
  entry: ResearchEntry;
  onPromote: (entryId: string) => void;
  highlightPriority?: boolean;
  autoFocusCompany?: boolean;
  onAutoFocusHandled?: () => void;
}

export function ResearchEntryRow({
  entry,
  onPromote,
  highlightPriority,
  autoFocusCompany,
  onAutoFocusHandled,
}: ResearchEntryRowProps) {
  const { updateResearchEntry, deleteResearchEntry, getContactById } = useCRMContext();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [intelDraft, setIntelDraft] = useState('');

  const linkedContact = entry.linkedContactId ? getContactById(entry.linkedContactId) : null;
  const intelSnippets = parseIntelLog(entry.notes);
  const latestIntel = getLatestIntelSnippet(entry.notes);

  const handleStartEdit = (field: string, value: string) => {
    setIsEditing(field);
    setEditValue(value);
  };

  const handleSaveEdit = (field: keyof ResearchEntry) => {
    updateResearchEntry(entry.id, { [field]: editValue });
    setIsEditing(null);
  };

  useEffect(() => {
    if (!autoFocusCompany) return;
    setIsEditing('company');
    setEditValue(entry.company || '');
    onAutoFocusHandled?.();
  }, [autoFocusCompany, entry.company, onAutoFocusHandled]);

  const fieldOrder: (keyof ResearchEntry)[] = ['company', 'poc', 'email'];

  const handleKeyDown = (e: React.KeyboardEvent, field: keyof ResearchEntry) => {
    if (e.key === 'Enter') {
      handleSaveEdit(field);
    } else if (e.key === 'Escape') {
      setIsEditing(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleSaveEdit(field);
      
      // Move to next field
      const currentIndex = fieldOrder.indexOf(field);
      const nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
      
      if (nextIndex >= 0 && nextIndex < fieldOrder.length) {
        const nextField = fieldOrder[nextIndex];
        const nextValue = entry[nextField] as string;
        handleStartEdit(nextField, nextValue || '');
      }
    }
  };

  const renderEditableCell = (field: keyof ResearchEntry, value: string, className?: string) => {
    if (isEditing === field) {
      return (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleSaveEdit(field)}
          onKeyDown={(e) => handleKeyDown(e, field)}
          autoFocus
          className="h-8 text-sm"
        />
      );
    }

    return (
      <span
        onClick={() => handleStartEdit(field, value)}
        className={`cursor-pointer hover:bg-accent/50 px-2 py-1 rounded block min-h-[28px] ${className || ''}`}
      >
        {value || <span className="text-muted-foreground italic">Click to edit</span>}
      </span>
    );
  };

  const handleAddIntel = () => {
    const nextNotes = appendIntelSnippet(entry.notes, intelDraft);
    if (nextNotes === entry.notes) return;
    updateResearchEntry(entry.id, { notes: nextNotes });
    setIntelDraft('');
    setIsExpanded(true);
  };

  const priorityRowClasses: Record<ResearchPriority, string> = {
    high: 'bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-950/35 dark:hover:bg-emerald-950/45',
    medium: 'bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-950/30 dark:hover:bg-amber-950/40',
    low: 'bg-rose-50/70 hover:bg-rose-100/70 dark:bg-rose-950/30 dark:hover:bg-rose-950/40',
  };

  return (
    <Fragment>
      <TableRow
        className={cn(
          highlightPriority && priorityRowClasses[entry.priority],
          highlightPriority && "priority-row",
          highlightPriority && `priority-${entry.priority}`,
        )}
      >
        <TableCell className="font-semibold text-foreground">
          {renderEditableCell('company', entry.company)}
        </TableCell>
        <TableCell>{renderEditableCell('poc', entry.poc)}</TableCell>
        <TableCell>
          {entry.email ? (
            <a
              href={`mailto:${entry.email}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {entry.email}
            </a>
          ) : (
            renderEditableCell('email', entry.email)
          )}
        </TableCell>
        <TableCell>
          {latestIntel ? (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="block max-w-[320px] text-left"
            >
              <span className="line-clamp-2 text-sm text-foreground">{latestIntel.text}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {latestIntel.timestampLabel ? `Latest intel • ${latestIntel.timestampLabel}` : 'Latest intel'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Add first intel snippet
            </button>
          )}
        </TableCell>
        <TableCell>
          <Select
            value={entry.priority}
            onValueChange={(value: ResearchPriority) =>
              updateResearchEntry(entry.id, { priority: value })
            }
          >
            <SelectTrigger className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {entry.status === 'promoted' && linkedContact ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => navigate(`/contacts/${linkedContact.id}`)}
              >
                Linked <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label={isExpanded ? 'Collapse intel log' : 'Expand intel log'}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
            </Button>
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
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={6} className="py-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Intel Log</p>
                  <p className="text-xs text-muted-foreground">
                    Capture loose evidence, rumors, campaign observations, and who told you what.
                  </p>
                </div>
                <div className="space-y-2">
                  <Textarea
                    value={intelDraft}
                    onChange={(event) => setIntelDraft(event.target.value)}
                    placeholder='Example: Ran ads with creators on IG; Ariana said their in-house team reached out directly.'
                    className="min-h-[96px] resize-none"
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleAddIntel} disabled={!intelDraft.trim()} size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Intel
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-2 rounded-xl border bg-background/80 p-3">
                <p className="text-sm font-medium text-foreground">Timeline</p>
                {intelSnippets.length > 0 ? (
                  <div className="space-y-2">
                    {[...intelSnippets].reverse().map((snippet, index) => (
                      <div key={`${snippet.timestampLabel ?? 'legacy'}-${index}`} className="rounded-lg border bg-card px-3 py-2">
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
                  <p className="text-sm text-muted-foreground">No intel yet. Add the first snippet on the left.</p>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
