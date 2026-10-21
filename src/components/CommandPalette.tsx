import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, CheckSquare, Plus } from 'lucide-react';
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
  const { companies, contacts, tasks } = useCRMContext();
  const recentCompanies = [...companies]
    .sort((a, b) => (b.lastActivityAt ?? b.createdAt).localeCompare(a.lastActivityAt ?? a.createdAt));

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
      <CommandInput placeholder="Search companies, people, tasks…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Quick Actions">
          {onAddContact && (
            <CommandItem onSelect={() => handleSelect(onAddContact)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Company
            </CommandItem>
          )}
          {onAddTask && (
            <CommandItem onSelect={() => handleSelect(onAddTask)}>
              <CheckSquare className="mr-2 h-4 w-4" />
              Add New Task
            </CommandItem>
          )}
        </CommandGroup>


        {companies.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Companies">
              {recentCompanies.map((company) => (
                <CommandItem
                  key={company.id}
                  value={`${company.name} ${company.city} ${company.id}`}
                  onSelect={() => handleSelect(() => navigate(`/companies/${company.id}`))}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  <span>{company.name}</span>
                  {company.city && <span className="ml-2 text-muted-foreground text-xs">{company.city}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {contacts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="People">
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={`${contact.fullName} ${contact.company} ${contact.id}`}
                  onSelect={() =>
                    handleSelect(() =>
                      navigate(contact.companyId ? `/companies/${contact.companyId}` : `/contacts/${contact.id}`),
                    )
                  }
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>{contact.fullName}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{contact.company}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {openTasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Open Tasks">
              {openTasks.slice(0, 5).map((task) => {
                const company = companies.find(c => c.id === task.companyId);
                return (
                  <CommandItem
                    key={task.id}
                    value={`${task.title} ${company?.name ?? ''} ${task.id}`}
                    onSelect={() => handleSelect(() => navigate(company ? `/companies/${company.id}` : '/app'))}
                  >
                    <CheckSquare className="mr-2 h-4 w-4" />
                    <span>{task.title}</span>
                    <span className="ml-2 text-muted-foreground text-xs">{company?.name ?? 'Personal'}</span>
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
