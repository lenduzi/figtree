import { useEffect, useState } from 'react';
import { ResearchEntry, ResearchPriority, ResearchStatus } from '@/types/crm';
import { TableCell, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { MoreHorizontal, Trash2, UserPlus, ExternalLink } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

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

  const linkedContact = entry.linkedContactId ? getContactById(entry.linkedContactId) : null;

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

  const fieldOrder: (keyof ResearchEntry)[] = ['company', 'poc', 'email', 'industry'];

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

  const priorityRowClasses: Record<ResearchPriority, string> = {
    high: 'bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-950/35 dark:hover:bg-emerald-950/45',
    medium: 'bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-950/30 dark:hover:bg-amber-950/40',
    low: 'bg-rose-50/70 hover:bg-rose-100/70 dark:bg-rose-950/30 dark:hover:bg-rose-950/40',
  };

  const statusColors: Record<ResearchStatus, string> = {
    researching: 'bg-muted text-muted-foreground',
    ready: 'bg-accent text-accent-foreground',
    promoted: 'bg-primary text-primary-foreground',
  };

  return (
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
      <TableCell>{renderEditableCell('industry', entry.industry)}</TableCell>
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
      <TableCell>
        <Badge className={statusColors[entry.status]}>
          {entry.status === 'promoted' && linkedContact ? (
            <button
              onClick={() => navigate(`/contacts/${linkedContact.id}`)}
              className="flex items-center gap-1 hover:underline"
            >
              Linked <ExternalLink className="h-3 w-3" />
            </button>
          ) : (
            entry.status
          )}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
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
      </TableCell>
    </TableRow>
  );
}
