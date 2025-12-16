import { useState } from 'react';
import { Phone, Mail, Users, FileText, PhoneMissed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCRMContext } from '@/contexts/CRMContext';
import { ActivityType } from '@/types/crm';
import { cn } from '@/lib/utils';

interface AddActivityDialogProps {
  contactId: string;
}

const activityTypes: { type: ActivityType; label: string; icon: React.ElementType }[] = [
  { type: 'call', label: 'Call', icon: Phone },
  { type: 'call_attempted', label: 'No Answer', icon: PhoneMissed },
  { type: 'email', label: 'Email', icon: Mail },
  { type: 'meeting', label: 'Meeting', icon: Users },
  { type: 'note', label: 'Note', icon: FileText },
];

export function AddActivityDialog({ contactId }: AddActivityDialogProps) {
  const { addActivity } = useCRMContext();
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ActivityType>('call');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    addActivity(contactId, selectedType, description);
    setDescription('');
    setSelectedType('call');
    setOpen(false);
  };

  const handleQuickLog = (type: ActivityType) => {
    const defaultDescriptions: Record<ActivityType, string> = {
      call: 'Had a phone call',
      call_attempted: 'Called, not reached',
      email: 'Sent an email',
      meeting: 'Had a meeting',
      note: 'Added a note',
      stage_change: '',
      task_completed: '',
    };
    addActivity(contactId, type, defaultDescriptions[type]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex gap-2">
        {activityTypes.slice(0, 4).map(({ type, label, icon: Icon }) => (
          <Button
            key={type}
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleQuickLog(type)}
            title={label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            + Log Activity
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Activity Type</Label>
            <div className="grid grid-cols-5 gap-2">
              {activityTypes.map(({ type, label, icon: Icon }) => (
                <Button
                  key={type}
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex flex-col h-auto py-3 gap-1',
                    selectedType === type && 'border-primary bg-primary/10'
                  )}
                  onClick={() => setSelectedType(type)}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{label}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened?"
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Log Activity</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
