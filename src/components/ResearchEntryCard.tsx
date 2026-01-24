import { useState } from 'react';
import { ResearchEntry, ResearchPriority, ResearchStatus } from '@/types/crm';
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

interface ResearchEntryCardProps {
  entry: ResearchEntry;
  onPromote: (entryId: string) => void;
}

export function ResearchEntryCard({ entry, onPromote }: ResearchEntryCardProps) {
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

  const handleKeyDown = (e: React.KeyboardEvent, field: keyof ResearchEntry) => {
    if (e.key === 'Enter') {
      handleSaveEdit(field);
    } else if (e.key === 'Escape') {
      setIsEditing(null);
    }
  };

  const renderEditableText = (
    field: keyof ResearchEntry,
    value: string,
    placeholder: string,
    className?: string,
  ) => {
    if (isEditing === field) {
      return (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleSaveEdit(field)}
          onKeyDown={(e) => handleKeyDown(e, field)}
          autoFocus
          className="h-9 text-sm"
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => handleStartEdit(field, value)}
        className={cn(
          "w-full text-left rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent/40",
          !value && "text-muted-foreground italic",
          className,
        )}
      >
        {value || placeholder}
      </button>
    );
  };

  const statusColors: Record<ResearchStatus, string> = {
    researching: 'bg-muted text-muted-foreground',
    ready: 'bg-accent text-accent-foreground',
    promoted: 'bg-primary text-primary-foreground',
  };

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {renderEditableText('company', entry.company, 'Add company', 'text-base font-semibold')}
        </div>
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

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Point of Contact</p>
        {renderEditableText('poc', entry.poc, 'Add POC')}
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Email</p>
        {renderEditableText('email', entry.email, 'Add email')}
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Industry</p>
        {renderEditableText('industry', entry.industry, 'Add industry')}
      </div>

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
      </div>
    </div>
  );
}
