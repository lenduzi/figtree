import { useState, useMemo } from 'react';
import { ResearchList, ResearchEntry, ResearchStatus, ResearchPriority } from '@/types/crm';
import { useCRMContext } from '@/contexts/CRMContext';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Search, ArrowUpDown } from 'lucide-react';
import { ResearchEntryRow } from './ResearchEntryRow';
import { PromoteEntryDialog } from './PromoteEntryDialog';

interface ResearchListSheetProps {
  list: ResearchList;
}

type SortField = 'company' | 'poc' | 'priority' | 'status' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

export function ResearchListSheet({ list }: ResearchListSheetProps) {
  const { getEntriesForList, addResearchEntry, researchEntries } = useCRMContext();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ResearchStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<ResearchPriority | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [promoteEntry, setPromoteEntry] = useState<ResearchEntry | null>(null);

  const entries = useMemo(() => {
    let filtered = getEntriesForList(list.id);

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.company.toLowerCase().includes(searchLower) ||
          e.poc.toLowerCase().includes(searchLower) ||
          e.email.toLowerCase().includes(searchLower) ||
          e.industry.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((e) => e.status === statusFilter);
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter((e) => e.priority === priorityFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      const priorityOrder: Record<ResearchPriority, number> = { high: 0, medium: 1, low: 2 };
      const statusOrder: Record<ResearchStatus, number> = { researching: 0, ready: 1, promoted: 2 };

      switch (sortField) {
        case 'company':
          comparison = a.company.localeCompare(b.company);
          break;
        case 'poc':
          comparison = a.poc.localeCompare(b.poc);
          break;
        case 'priority':
          comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
          break;
        case 'status':
          comparison = statusOrder[a.status] - statusOrder[b.status];
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [list.id, getEntriesForList, search, statusFilter, priorityFilter, sortField, sortDirection, researchEntries]);

  const handleAddRow = () => {
    addResearchEntry(list.id, {});
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handlePromote = (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (entry) {
      setPromoteEntry(entry);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ResearchStatus | 'all')}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="researching">Researching</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="promoted">Promoted</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as ResearchPriority | 'all')}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="cursor-pointer" onClick={() => toggleSort('company')}>
                <div className="flex items-center gap-1">
                  Company
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('poc')}>
                <div className="flex items-center gap-1">
                  POC
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('priority')}>
                <div className="flex items-center gap-1">
                  Priority
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('status')}>
                <div className="flex items-center gap-1">
                  Status
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <ResearchEntryRow
                key={entry.id}
                entry={entry}
                onPromote={handlePromote}
              />
            ))}
          </TableBody>
        </Table>

        {entries.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            {search || statusFilter !== 'all' || priorityFilter !== 'all'
              ? 'No entries match your filters'
              : 'No entries yet. Add your first one!'}
          </div>
        )}
      </div>

      {/* Add Row Button */}
      <Button onClick={handleAddRow} variant="outline" className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add Entry
      </Button>

      {/* Promote Dialog */}
      <PromoteEntryDialog
        entry={promoteEntry}
        open={!!promoteEntry}
        onOpenChange={(open) => !open && setPromoteEntry(null)}
      />
    </div>
  );
}