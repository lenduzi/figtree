import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, Clock, Bell, BellOff, Edit2, X, Trash2, Check, User } from 'lucide-react';
import { Task, Contact } from '@/types/crm';
import { useCRMContext } from '@/contexts/CRMContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface TaskDetailDialogProps {
  task: Task | null;
  contact?: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactClick?: (contactId: string) => void;
  showContact?: boolean;
}

export function TaskDetailDialog({
  task,
  contact,
  open,
  onOpenChange,
  onContactClick,
  showContact = false,
}: TaskDetailDialogProps) {
  const { updateTask, deleteTask, toggleTaskComplete, rescheduleTask } = useCRMContext();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    dueDate: new Date(),
    dueTime: '',
    hasReminder: false,
  });

  useEffect(() => {
    if (task) {
      setEditData({
        title: task.title,
        description: task.description || '',
        dueDate: parseISO(task.dueDate),
        dueTime: task.dueTime || '',
        hasReminder: task.hasReminder,
      });
      setIsEditing(false);
    }
  }, [task]);

  if (!task) return null;

  const handleSave = () => {
    if (!editData.title.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter a task title.',
        variant: 'destructive',
      });
      return;
    }

    updateTask(task.id, {
      title: editData.title.trim(),
      description: editData.description.trim() || undefined,
      dueDate: format(editData.dueDate, 'yyyy-MM-dd'),
      dueTime: editData.dueTime || undefined,
      hasReminder: editData.hasReminder,
    });

    toast({
      title: 'Task updated',
      description: 'Your changes have been saved.',
    });
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteTask(task.id);
    onOpenChange(false);
    toast({
      title: 'Task deleted',
    });
  };

  const handleComplete = () => {
    toggleTaskComplete(task.id);
    onOpenChange(false);
  };

  const dueDate = parseISO(task.dueDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg lg:max-w-xl">
        <DialogHeader className="flex flex-row items-start justify-between gap-4">
          <DialogTitle className="text-lg lg:text-xl flex-1">
            {isEditing ? 'Edit Task' : 'Task Details'}
          </DialogTitle>
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="shrink-0"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </DialogHeader>

        {isEditing ? (
          <div className="space-y-4 lg:space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                placeholder="Task title"
                className="lg:text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                placeholder="Add details about this task..."
                className="min-h-24 lg:min-h-32 lg:text-base resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {format(editData.dueDate, 'MMM d, yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={editData.dueDate}
                      onSelect={(date) => date && setEditData({ ...editData, dueDate: date })}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">Time (optional)</Label>
                <Input
                  id="time"
                  type="time"
                  value={editData.dueTime}
                  onChange={(e) => setEditData({ ...editData, dueTime: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="reminder" className="cursor-pointer">
                Enable Reminder
              </Label>
              <Switch
                id="reminder"
                checked={editData.hasReminder}
                onCheckedChange={(checked) => setEditData({ ...editData, hasReminder: checked })}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 lg:space-y-5">
            <div>
              <h3 className={cn(
                "text-lg lg:text-xl font-medium",
                task.completed && "line-through text-muted-foreground"
              )}>
                {task.title}
              </h3>
              {task.description && (
                <p className="mt-2 text-sm lg:text-base text-muted-foreground whitespace-pre-wrap">
                  {task.description}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3 text-sm lg:text-base">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 lg:h-5 lg:w-5" />
                {format(dueDate, 'EEEE, MMMM d, yyyy')}
              </div>
              {task.dueTime && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 lg:h-5 lg:w-5" />
                  {task.dueTime}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                {task.hasReminder ? (
                  <><Bell className="h-4 w-4 lg:h-5 lg:w-5" /> Reminder on</>
                ) : (
                  <><BellOff className="h-4 w-4 lg:h-5 lg:w-5" /> No reminder</>
                )}
              </div>
            </div>

            {showContact && contact && (
              <button
                onClick={() => {
                  onContactClick?.(contact.id);
                  onOpenChange(false);
                }}
                className="flex items-center gap-2 text-sm lg:text-base text-primary hover:underline"
              >
                <User className="h-4 w-4 lg:h-5 lg:w-5" />
                {contact.fullName} • {contact.company}
              </button>
            )}

            <div className="flex gap-2 pt-2 border-t">
              <Button
                variant={task.completed ? "outline" : "default"}
                className="flex-1"
                onClick={handleComplete}
              >
                <Check className="h-4 w-4 mr-1" />
                {task.completed ? 'Mark Incomplete' : 'Mark Complete'}
              </Button>
              <Button
                variant="outline"
                className="text-destructive-foreground hover:bg-destructive/10"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}