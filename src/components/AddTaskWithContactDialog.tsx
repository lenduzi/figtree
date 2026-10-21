import { useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useCRMContext } from '@/contexts/CRMContext';
import { cn, toLocalDateKey } from '@/lib/utils';

const PERSONAL = '';

interface AddTaskWithContactDialogProps {
  trigger?: React.ReactNode;
  /** Pre-select a company; leave empty for a personal task. */
  defaultCompanyId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerless?: boolean;
}

/** New task for a company, or a personal task when no company is picked. */
export function AddTaskWithContactDialog({
  trigger,
  defaultCompanyId,
  open: controlledOpen,
  onOpenChange,
  triggerless = false,
}: AddTaskWithContactDialogProps) {
  const { addTask, companies } = useCRMContext();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (value: boolean) => (onOpenChange ? onOpenChange(value) : setUncontrolledOpen(value));
  const [pickerOpen, setPickerOpen] = useState(false);

  const emptyForm = () => ({
    companyId: defaultCompanyId ?? PERSONAL,
    title: '',
    description: '',
    dueDate: toLocalDateKey(),
    dueTime: '',
    hasReminder: true,
  });
  const [formData, setFormData] = useState(emptyForm);

  const sortedCompanies = [...companies].sort((a, b) => a.name.localeCompare(b.name));
  const selectedCompany = companies.find((company) => company.id === formData.companyId);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.title.trim()) return;
    addTask({
      companyId: formData.companyId || null,
      contactId: null,
      title: formData.title.trim(),
      description: formData.description,
      dueDate: formData.dueDate,
      dueTime: formData.dueTime,
      hasReminder: formData.hasReminder,
      completed: false,
    });
    setFormData(emptyForm());
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
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>For</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className="truncate">{selectedCompany ? selectedCompany.name : 'Personal (no company)'}</span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command>
                  <CommandInput placeholder="Search companies…" />
                  <CommandList>
                    <CommandEmpty>No company found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__personal__ personal my own"
                        onSelect={() => {
                          setFormData({ ...formData, companyId: PERSONAL });
                          setPickerOpen(false);
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', formData.companyId === PERSONAL ? 'opacity-100' : 'opacity-0')} />
                        Personal (no company)
                      </CommandItem>
                      {sortedCompanies.map((company) => (
                        <CommandItem
                          key={company.id}
                          value={`${company.name} ${company.city} ${company.id}`}
                          onSelect={() => {
                            setFormData({ ...formData, companyId: company.id });
                            setPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn('mr-2 h-4 w-4', formData.companyId === company.id ? 'opacity-100' : 'opacity-0')}
                          />
                          <span className="truncate">{company.name}</span>
                          {company.city && <span className="ml-auto text-xs text-muted-foreground">{company.city}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-title">Task *</Label>
            <Input
              id="task-title"
              value={formData.title}
              onChange={(event) => setFormData({ ...formData, title: event.target.value })}
              placeholder={selectedCompany ? 'Follow up on the pilot offer' : 'Renew insurance'}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Details</Label>
            <Textarea
              id="task-description"
              rows={2}
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="task-date">Due</Label>
              <Input
                id="task-date"
                type="date"
                value={formData.dueDate}
                onChange={(event) => setFormData({ ...formData, dueDate: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-time">Time</Label>
              <Input
                id="task-time"
                type="time"
                value={formData.dueTime}
                onChange={(event) => setFormData({ ...formData, dueTime: event.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="task-reminder">Remind me at the due time</Label>
            <Switch
              id="task-reminder"
              checked={formData.hasReminder}
              onCheckedChange={(checked) => setFormData({ ...formData, hasReminder: checked })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formData.title.trim()}>
              Add task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
