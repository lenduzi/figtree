import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, CheckSquare, Plus } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useCRMContext } from '@/contexts/CRMContext';

interface CommandPaletteProps {
  onAddContact?: () => void;
  onAddTask?: () => void;
}

export function CommandPalette({ onAddContact, onAddTask }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { contacts, tasks, getStageById } = useCRMContext();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (callback: () => void) => {
    callback();
    setOpen(false);
  };

  const openTasks = tasks.filter(t => !t.completed);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search contacts, tasks, or navigate..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Quick Actions">
          {onAddContact && (
            <CommandItem onSelect={() => handleSelect(onAddContact)}>
              <Plus className="mr-2 h-4 w-4" />
              Add New Contact
            </CommandItem>
          )}
          {onAddTask && (
            <CommandItem onSelect={() => handleSelect(onAddTask)}>
              <CheckSquare className="mr-2 h-4 w-4" />
              Add New Task
            </CommandItem>
          )}
        </CommandGroup>


        {contacts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Contacts">
              {contacts.slice(0, 5).map((contact) => {
                const stage = getStageById(contact.stageId);
                return (
                  <CommandItem
                    key={contact.id}
                    onSelect={() => handleSelect(() => navigate(`/contacts/${contact.id}`))}
                  >
                    <User className="mr-2 h-4 w-4" />
                    <span>{contact.fullName}</span>
                    <span className="ml-2 text-muted-foreground text-xs">
                      {contact.company}
                      {stage && ` • ${stage.name}`}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {openTasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Open Tasks">
              {openTasks.slice(0, 5).map((task) => {
                const contact = contacts.find(c => c.id === task.contactId);
                return (
                  <CommandItem
                    key={task.id}
                    onSelect={() => handleSelect(() => navigate(`/contacts/${task.contactId}`))}
                  >
                    <CheckSquare className="mr-2 h-4 w-4" />
                    <span>{task.title}</span>
                    {contact && (
                      <span className="ml-2 text-muted-foreground text-xs">
                        {contact.fullName}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
