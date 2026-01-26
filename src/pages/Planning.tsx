import { useState } from 'react';
import { useCRMContext } from '@/contexts/CRMContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, FolderOpen, MoreHorizontal, Trash2, Pencil, ChevronLeft } from 'lucide-react';
import { ResearchListSheet } from '@/components/ResearchListSheet';
import { ResearchList } from '@/types/crm';

export default function Planning() {
  const {
    researchLists,
    addResearchList,
    updateResearchList,
    deleteResearchList,
    getEntriesForList,
    addResearchEntry,
  } = useCRMContext();
  const [selectedList, setSelectedList] = useState<ResearchList | null>(null);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingList, setEditingList] = useState<ResearchList | null>(null);
  const [editName, setEditName] = useState('');
  const [autoFocusEntryId, setAutoFocusEntryId] = useState<string | null>(null);

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    const list = addResearchList(newListName.trim());
    setNewListName('');
    setNewListDialogOpen(false);
    setSelectedList(list);
  };

  const handleRenameList = () => {
    if (!editingList || !editName.trim()) return;
    updateResearchList(editingList.id, { name: editName.trim() });
    if (selectedList?.id === editingList.id) {
      setSelectedList({ ...selectedList, name: editName.trim() });
    }
    setEditingList(null);
    setEditName('');
  };

  const handleDeleteList = (listId: string) => {
    deleteResearchList(listId);
    if (selectedList?.id === listId) {
      setSelectedList(null);
    }
  };

  const handleAddEntry = () => {
    if (!selectedList) return;
    const newEntry = addResearchEntry(selectedList.id, {});
    setAutoFocusEntryId(newEntry.id);
  };

  // If a list is selected, show the sheet view
  if (selectedList) {
    return (
      <div className="p-6 lg:p-8 xl:p-10 max-w-6xl 2xl:max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedList(null)}
            className="h-9 w-9"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground">{selectedList.name}</h1>
            <p className="text-muted-foreground lg:text-lg mt-1">Research List</p>
          </div>
        </div>
        <Button className="hidden sm:inline-flex" onClick={handleAddEntry}>
          <Plus className="h-4 w-4 mr-2" />
          Add Entry
        </Button>
      </div>
        <ResearchListSheet
          list={selectedList}
          onAddEntry={handleAddEntry}
          autoFocusEntryId={autoFocusEntryId}
          onAutoFocusHandled={() => setAutoFocusEntryId(null)}
        />
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-4xl lg:max-w-5xl 2xl:max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sr-only sm:not-sr-only text-3xl lg:text-4xl font-bold text-foreground">Planning</h1>
          <p className="text-muted-foreground lg:text-lg mt-1">
            Research and organize prospects before adding to your pipeline
          </p>
        </div>
        <Button onClick={() => setNewListDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New List
        </Button>
      </div>

      {researchLists.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No research lists yet</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-sm">
              Create your first list to start organizing prospects, companies, and research before adding them to your CRM.
            </p>
            <Button onClick={() => setNewListDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First List
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {researchLists.map((list) => {
            const entries = getEntriesForList(list.id);
            const promotedCount = entries.filter((e) => e.status === 'promoted').length;
            const readyCount = entries.filter((e) => e.status === 'ready').length;

            return (
              <Card
                key={list.id}
                className="cursor-pointer transition-colors hover:bg-muted/50 hover:border-muted-foreground/20"
                onClick={() => setSelectedList(list)}
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-base font-medium">{list.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingList(list);
                          setEditName(list.name);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteList(list.id);
                        }}
                        className="text-destructive-foreground"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{entries.length} entries</span>
                    {readyCount > 0 && <span className="text-accent-foreground">{readyCount} ready</span>}
                    {promotedCount > 0 && <span className="text-primary">{promotedCount} promoted</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New List Dialog */}
      <Dialog open={newListDialogOpen} onOpenChange={setNewListDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New List</DialogTitle>
            <DialogDescription>
              Give your research list a name (e.g., "Target Brands Q1", "Hamburg Experiences")
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="List name..."
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewListDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateList} disabled={!newListName.trim()}>
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!editingList} onOpenChange={(open) => !open && setEditingList(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename List</DialogTitle>
            <DialogDescription>Enter a new name for this list</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="List name..."
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRenameList()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingList(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameList} disabled={!editName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
