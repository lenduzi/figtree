import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ArrowUp, ArrowDown, User, Plus } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { AddContactDialog } from '@/components/AddContactDialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type SortField = 'name' | 'company' | 'email' | 'lastInteraction' | 'stage';
type SortDirection = 'asc' | 'desc';

export default function Contacts() {
  const navigate = useNavigate();
  const { contacts, stages, tasks, getStageById, meContactId } = useCRMContext();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [addContactOpen, setAddContactOpen] = useState(false);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Default direction: asc for text fields, desc for date (most recent first)
      setSortDirection(field === 'lastInteraction' ? 'desc' : 'asc');
    }
  };

  const filteredContacts = contacts
    .filter(contact => {
      const matchesSearch = 
        contact.fullName.toLowerCase().includes(search.toLowerCase()) ||
        contact.company.toLowerCase().includes(search.toLowerCase()) ||
        contact.email.toLowerCase().includes(search.toLowerCase());
      
      const matchesStage = stageFilter === 'all' || contact.stageId === stageFilter;
      
      return matchesSearch && matchesStage;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.fullName.localeCompare(b.fullName);
          break;
        case 'company':
          comparison = (a.company || '').localeCompare(b.company || '');
          break;
        case 'email':
          comparison = (a.email || '').localeCompare(b.email || '');
          break;
        case 'lastInteraction':
          const aDate = a.lastInteractionDate ? new Date(a.lastInteractionDate).getTime() : 0;
          const bDate = b.lastInteractionDate ? new Date(b.lastInteractionDate).getTime() : 0;
          comparison = aDate - bDate;
          break;
        case 'stage':
          const aStage = getStageById(a.stageId)?.name || '';
          const bStage = getStageById(b.stageId)?.name || '';
          comparison = aStage.localeCompare(bStage);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const getOpenTaskCount = (contactId: string) => {
    return tasks.filter(t => t.contactId === contactId && !t.completed).length;
  };

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-4xl lg:max-w-5xl 2xl:max-w-6xl mx-auto">
      <AddContactDialog open={addContactOpen} onOpenChange={setAddContactOpen} triggerless />

      <div className="flex items-center justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">Contacts</h1>
          <p className="text-muted-foreground lg:text-lg mt-1">
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button className="hidden sm:inline-flex" onClick={() => setAddContactOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Contact
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-4 sm:mb-6 lg:mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 lg:pl-11 lg:h-11 lg:text-base"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="hidden sm:flex w-full sm:w-48 lg:w-56 lg:h-11">
            <Filter className="h-4 w-4 lg:h-5 lg:w-5 mr-2" />
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                {stage.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex sm:hidden gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "shrink-0 rounded-full px-4",
            stageFilter === 'all' && "bg-primary text-primary-foreground border-primary"
          )}
          onClick={() => setStageFilter('all')}
        >
          All
        </Button>
        {stages.map((stage) => (
          <Button
            key={stage.id}
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              "shrink-0 rounded-full px-4 whitespace-nowrap",
              stageFilter === stage.id && "bg-primary text-primary-foreground border-primary"
            )}
            onClick={() => setStageFilter(stage.id)}
          >
            {stage.name}
          </Button>
        ))}
      </div>

      {filteredContacts.length === 0 ? (
        <div className="text-center py-12 lg:py-16 bg-card rounded-lg border">
          <p className="text-muted-foreground lg:text-lg">
            {contacts.length === 0 
              ? 'No contacts yet. Add your first contact to get started!'
              : 'No contacts match your search criteria.'
            }
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {filteredContacts.map((contact) => {
              const stage = getStageById(contact.stageId);
              return (
                <button
                  key={contact.id}
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                  className="w-full text-left rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-foreground truncate">
                          {contact.fullName}
                        </span>
                        {contact.id === meContactId && (
                          <Badge variant="outline" className="px-1.5 py-0.5">
                            <User className="h-3 w-3" />
                            <span className="sr-only">Me</span>
                          </Badge>
                        )}
                      </div>
                    </div>
                    {stage && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-xs px-2 py-1"
                        style={{
                          backgroundColor: `${stage.color}20`,
                          color: stage.color,
                        }}
                      >
                        {stage.name}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last contact:{" "}
                    {contact.lastInteractionDate
                      ? formatDistanceToNow(new Date(contact.lastInteractionDate), { addSuffix: true })
                      : "Never"}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:block border rounded-lg overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="lg:text-base">
                  <TableHead 
                    className="lg:py-4 cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => toggleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Name
                      {sortField === 'name' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="lg:py-4 cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => toggleSort('company')}
                  >
                    <div className="flex items-center gap-1">
                      Company
                      {sortField === 'company' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="lg:py-4 cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => toggleSort('email')}
                  >
                    <div className="flex items-center gap-1">
                      Email
                      {sortField === 'email' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="lg:py-4 cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => toggleSort('lastInteraction')}
                  >
                    <div className="flex items-center gap-1">
                      Last Contact
                      {sortField === 'lastInteraction' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="lg:py-4 cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => toggleSort('stage')}
                  >
                    <div className="flex items-center gap-1">
                      Stage
                      {sortField === 'stage' && (
                        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-right lg:py-4">Tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.map((contact) => {
                  const stage = getStageById(contact.stageId);
                  const taskCount = getOpenTaskCount(contact.id);
                  return (
                    <TableRow
                      key={contact.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/contacts/${contact.id}`)}
                    >
                      <TableCell className="font-medium lg:py-4 lg:text-base">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{contact.fullName}</span>
                          {contact.id === meContactId && (
                            <Badge variant="outline" className="px-1.5 py-0.5">
                              <User className="h-3 w-3" />
                              <span className="sr-only">Me</span>
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="lg:py-4 lg:text-base">{contact.company || '-'}</TableCell>
                      <TableCell className="lg:py-4 lg:text-base">{contact.email || '-'}</TableCell>
                      <TableCell className="lg:py-4">
                        {contact.lastInteractionDate ? (
                          <span className="text-sm lg:text-base text-muted-foreground">
                            {formatDistanceToNow(new Date(contact.lastInteractionDate), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-sm lg:text-base text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="lg:py-4">
                        {stage && (
                          <Badge 
                            variant="secondary"
                            className="lg:text-sm lg:px-3 lg:py-1"
                            style={{ 
                              backgroundColor: `${stage.color}20`,
                              color: stage.color,
                            }}
                          >
                            {stage.name}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right lg:py-4">
                        {taskCount > 0 && (
                          <Badge variant="outline" className="lg:text-sm">{taskCount}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Button
        className="sm:hidden fixed right-[calc(1.25rem+env(safe-area-inset-right))] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] h-12 w-12 rounded-full p-0 shadow-lg"
        onClick={() => setAddContactOpen(true)}
        aria-label="Add Contact"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}
