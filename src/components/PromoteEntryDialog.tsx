import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCRMContext } from '@/contexts/CRMContext';
import { ResearchEntry } from '@/types/crm';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface PromoteEntryDialogProps {
  entry: ResearchEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromoteEntryDialog({ entry, open, onOpenChange }: PromoteEntryDialogProps) {
  const { stages, promoteEntryToContact } = useCRMContext();
  const navigate = useNavigate();
  const [selectedStage, setSelectedStage] = useState(stages[0]?.id || 'lead');
  const [createTask, setCreateTask] = useState(true);

  const handlePromote = () => {
    if (!entry) return;

    const contact = promoteEntryToContact(entry.id, selectedStage, createTask);
    if (contact) {
      toast.success(`${entry.poc || entry.company} promoted to Contacts!`, {
        action: {
          label: 'View',
          onClick: () => navigate(`/contacts/${contact.id}`),
        },
      });
      onOpenChange(false);
    }
  };

  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote to Contact</DialogTitle>
          <DialogDescription>
            Create a CRM contact from "{entry.poc || entry.company}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Initial Pipeline Stage</Label>
            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="create-task"
              checked={createTask}
              onCheckedChange={(checked) => setCreateTask(checked as boolean)}
            />
            <Label htmlFor="create-task" className="cursor-pointer">
              Create a follow-up task for today
            </Label>
          </div>

          <div className="bg-muted p-3 rounded-md text-sm space-y-1">
            <p><strong>Company:</strong> {entry.company || '—'}</p>
            <p><strong>Contact:</strong> {entry.poc || '—'}</p>
            <p><strong>Email:</strong> {entry.email || '—'}</p>
            {entry.notes && <p><strong>Notes:</strong> {entry.notes}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePromote}>
            Promote to Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}