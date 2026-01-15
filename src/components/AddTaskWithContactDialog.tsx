import { useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useCRMContext } from '@/contexts/CRMContext';
import { Separator } from '@/components/ui/separator';

interface AddTaskWithContactDialogProps {
  trigger?: React.ReactNode;
  defaultContactId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerless?: boolean;
}

export function AddTaskWithContactDialog({ 
  trigger, 
  defaultContactId,
  open: controlledOpen,
  onOpenChange,
  triggerless = false,
}: AddTaskWithContactDialogProps) {
  const { addTask, addContact, contacts, stages } = useCRMContext();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (value: boolean) => {
    if (isControlled) {
      onOpenChange?.(value);
    } else {
      setUncontrolledOpen(value);
    }
  };
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [formData, setFormData] = useState({
    contactId: defaultContactId || '',
    title: '',
    description: '',
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: '',
    hasReminder: true,
  });

  // Sort contacts alphabetically by name
  const sortedContacts = [...contacts].sort((a, b) => a.fullName.localeCompare(b.fullName));

  const handleQuickAddContact = () => {
    if (!quickAddName.trim()) return;
    
    const newContact = addContact({
      fullName: quickAddName.trim(),
      role: '',
      company: '',
      website: '',
      email: '',
      phone: '',
      stageId: stages[0]?.id || '',
      notes: '',
    });
    
    setFormData({ ...formData, contactId: newContact.id });
    setQuickAddName('');
    setShowQuickAdd(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.contactId) return;

    addTask({
      contactId: formData.contactId,
      title: formData.title,
      description: formData.description,
      dueDate: formData.dueDate,
      dueTime: formData.dueTime,
      hasReminder: formData.hasReminder,
      completed: false,
    });

    setFormData({
      contactId: '',
      title: '',
      description: '',
      dueDate: new Date().toISOString().split('T')[0],
      dueTime: '',
      hasReminder: true,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!triggerless && (
        <DialogTrigger asChild>
          {trigger || (
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Task
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contact">Contact *</Label>
            {!showQuickAdd ? (
              <div className="space-y-2">
                <Select
                  value={formData.contactId}
                  onValueChange={(value) => setFormData({ ...formData, contactId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contact..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedContacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.fullName}{contact.company ? ` — ${contact.company}` : ''}
                      </SelectItem>
                    ))}
                    <Separator className="my-1" />
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-primary hover:bg-accent rounded-sm cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowQuickAdd(true);
                      }}
                    >
                      <UserPlus className="h-4 w-4" />
                      Add new contact
                    </button>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2 p-3 border border-border rounded-md bg-muted/30">
                <Label htmlFor="quickAddName" className="text-sm">New contact name</Label>
                <Input
                  id="quickAddName"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="Enter name..."
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">You can add more details later in Contacts.</p>
                <div className="flex gap-2 pt-1">
                  <Button 
                    type="button" 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      setShowQuickAdd(false);
                      setQuickAddName('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="button" 
                    size="sm" 
                    onClick={handleQuickAddContact}
                    disabled={!quickAddName.trim()}
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Follow up call"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional details..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueTime">Time</Label>
              <Input
                id="dueTime"
                type="time"
                value={formData.dueTime}
                onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="reminder">Enable Reminder</Label>
            <Switch
              id="reminder"
              checked={formData.hasReminder}
              onCheckedChange={(checked) => setFormData({ ...formData, hasReminder: checked })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formData.contactId || !formData.title.trim()}>
              Add Task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
