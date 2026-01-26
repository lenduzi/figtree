import { useState } from 'react';
import { format } from 'date-fns';
import { Phone, Mail, Users, FileText, PhoneMissed, Calendar as CalendarIcon } from 'lucide-react';
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
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  const [activityDate, setActivityDate] = useState(new Date());

  const resetForm = () => {
    setDescription('');
    setSelectedType('call');
    setActivityDate(new Date());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    addActivity(contactId, selectedType, description, activityDate);
    resetForm();
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

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const nextDate = new Date(activityDate);
    nextDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    setActivityDate(nextDate);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
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

          <div className="space-y-2">
            <Label>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(activityDate, 'MMM d, yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={activityDate}
                  onSelect={handleDateSelect}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Log Activity</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
