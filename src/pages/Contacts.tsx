import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ArrowUpDown } from 'lucide-react';
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

type SortOption = 'name' | 'company' | 'lastInteraction' | 'created';

export default function Contacts() {
  const navigate = useNavigate();
  const { contacts, stages, tasks, getStageById } = useCRMContext();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name');

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
      switch (sortBy) {
        case 'name':
          return a.fullName.localeCompare(b.fullName);
        case 'company':
          return a.company.localeCompare(b.company);
        case 'lastInteraction':
          const aDate = a.lastInteractionDate ? new Date(a.lastInteractionDate).getTime() : 0;
          const bDate = b.lastInteractionDate ? new Date(b.lastInteractionDate).getTime() : 0;
          return bDate - aDate; // Most recent first
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return 0;
      }
    });

  const getOpenTaskCount = (contactId: string) => {
    return tasks.filter(t => t.contactId === contactId && !t.completed).length;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <AddContactDialog />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="h-4 w-4 mr-2" />
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
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-full sm:w-48">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="lastInteraction">Last Interaction</SelectItem>
            <SelectItem value="created">Date Created</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredContacts.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border">
          <p className="text-muted-foreground">
            {contacts.length === 0 
              ? 'No contacts yet. Add your first contact to get started!'
              : 'No contacts match your search criteria.'
            }
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Last Contact</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
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
                    <TableCell className="font-medium">{contact.fullName}</TableCell>
                    <TableCell>{contact.company || '-'}</TableCell>
                    <TableCell>{contact.email || '-'}</TableCell>
                    <TableCell>
                      {contact.lastInteractionDate ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(contact.lastInteractionDate), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {stage && (
                        <Badge 
                          variant="secondary"
                          style={{ 
                            backgroundColor: `${stage.color}20`,
                            color: stage.color,
                          }}
                        >
                          {stage.name}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {taskCount > 0 && (
                        <Badge variant="outline">{taskCount}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
