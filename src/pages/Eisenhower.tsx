import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isPast, isToday, parseISO } from 'date-fns';
import {
  ArrowUpRight,
  Flame,
  Target,
  Zap,
  CircleSlash,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { EisenhowerItem, Task } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TaskDetailDialog } from '@/components/TaskDetailDialog';
import { cn } from '@/lib/utils';

const QUADRANTS = [
  {
    id: 'important_urgent',
    title: 'Important & Urgent',
    description: 'Do now',
    importance: true,
    urgency: true,
    icon: Flame,
    className: 'border-rose-200/70 bg-rose-50/60',
    accent: 'text-rose-700',
  },
  {
    id: 'important_not_urgent',
    title: 'Important, not Urgent',
    description: 'Schedule',
    importance: true,
    urgency: false,
    icon: Target,
    className: 'border-emerald-200/70 bg-emerald-50/60',
    accent: 'text-emerald-700',
  },
  {
    id: 'not_important_urgent',
    title: 'Not Important, Urgent',
    description: 'Delegate',
    importance: false,
    urgency: true,
    icon: Zap,
    className: 'border-sky-200/70 bg-sky-50/60',
    accent: 'text-sky-700',
  },
  {
    id: 'not_important_not_urgent',
    title: 'Not Important, not Urgent',
    description: 'Eliminate',
    importance: false,
    urgency: false,
    icon: CircleSlash,
    className: 'border-slate-200/70 bg-slate-50/70',
    accent: 'text-slate-600',
  },
] as const;

type QuadrantId = (typeof QUADRANTS)[number]['id'];

const quadrantById = new Map(QUADRANTS.map((quadrant) => [quadrant.id, quadrant]));

const resolveQuadrant = (item: EisenhowerItem): QuadrantId => {
  if (item.importance && item.urgency) return 'important_urgent';
  if (item.importance && !item.urgency) return 'important_not_urgent';
  if (!item.importance && item.urgency) return 'not_important_urgent';
  return 'not_important_not_urgent';
};

export default function Eisenhower() {
  const navigate = useNavigate();
  const {
    tasks,
    contacts,
    eisenhowerItems,
    addEisenhowerItem,
    updateEisenhowerItem,
    deleteEisenhowerItem,
    toggleEisenhowerItemComplete,
    toggleTaskComplete,
  } = useCRMContext();

  const [drafts, setDrafts] = useState<Record<QuadrantId, string>>(() => ({
    important_urgent: '',
    important_not_urgent: '',
    not_important_urgent: '',
    not_important_not_urgent: '',
  }));

  const [importOpen, setImportOpen] = useState(false);
  const [importQuadrant, setImportQuadrant] = useState<QuadrantId>('important_urgent');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const contactsById = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts]
  );
  const linkedTaskIds = useMemo(
    () => new Set(eisenhowerItems.filter((item) => item.linkedTaskId).map((item) => item.linkedTaskId as string)),
    [eisenhowerItems]
  );

  const itemsByQuadrant = useMemo(() => {
    const grouped: Record<QuadrantId, EisenhowerItem[]> = {
      important_urgent: [],
      important_not_urgent: [],
      not_important_urgent: [],
      not_important_not_urgent: [],
    };

    eisenhowerItems.forEach((item) => {
      grouped[resolveQuadrant(item)].push(item);
    });

    Object.keys(grouped).forEach((key) => {
      grouped[key as QuadrantId].sort((a, b) => {
        const aCompleted = tasksById.get(a.linkedTaskId || '')?.completed ?? a.completed;
        const bCompleted = tasksById.get(b.linkedTaskId || '')?.completed ?? b.completed;
        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
        return a.createdAt.localeCompare(b.createdAt);
      });
    });

    return grouped;
  }, [eisenhowerItems, tasksById]);

  const availableTasks = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return tasks
      .filter((task) => !task.completed)
      .filter((task) => !linkedTaskIds.has(task.id))
      .filter((task) => {
        if (!normalized) return true;
        const contact = contactsById.get(task.contactId);
        return (
          task.title.toLowerCase().includes(normalized) ||
          task.description?.toLowerCase().includes(normalized) ||
          contact?.fullName.toLowerCase().includes(normalized) ||
          contact?.company.toLowerCase().includes(normalized)
        );
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [tasks, searchTerm, linkedTaskIds, contactsById]);

  const handleAddItem = (quadrantId: QuadrantId) => {
    const value = drafts[quadrantId].trim();
    if (!value) return;
    const quadrant = quadrantById.get(quadrantId);
    if (!quadrant) return;
    addEisenhowerItem({
      title: value,
      importance: quadrant.importance,
      urgency: quadrant.urgency,
      completed: false,
      linkedTaskId: null,
    });
    setDrafts((prev) => ({ ...prev, [quadrantId]: '' }));
  };

  const handleToggleComplete = (item: EisenhowerItem) => {
    const linkedTask = item.linkedTaskId ? tasksById.get(item.linkedTaskId) : undefined;
    if (linkedTask) {
      toggleTaskComplete(linkedTask.id);
      return;
    }
    toggleEisenhowerItemComplete(item.id);
  };

  const handleMove = (item: EisenhowerItem, quadrantId: QuadrantId) => {
    const quadrant = quadrantById.get(quadrantId);
    if (!quadrant) return;
    updateEisenhowerItem(item.id, {
      importance: quadrant.importance,
      urgency: quadrant.urgency,
    });
  };

  const resetImportState = () => {
    setSelectedTaskIds(new Set());
    setSearchTerm('');
    setImportQuadrant('important_urgent');
  };

  const handleImport = () => {
    const quadrant = quadrantById.get(importQuadrant);
    if (!quadrant) return;
    const itemsToAdd = Array.from(selectedTaskIds)
      .map((id) => tasksById.get(id))
      .filter(Boolean) as Task[];

    itemsToAdd.forEach((task) => {
      addEisenhowerItem({
        title: task.title,
        importance: quadrant.importance,
        urgency: quadrant.urgency,
        completed: task.completed,
        linkedTaskId: task.id,
      });
    });

    resetImportState();
    setImportOpen(false);
  };

  const handleImportOpenChange = (open: boolean) => {
    setImportOpen(open);
    if (!open) {
      resetImportState();
    }
  };

  const totalItems = eisenhowerItems.length;
  const importCount = selectedTaskIds.size;
  const importLabel = importCount
    ? `Import ${importCount} ${importCount === 1 ? 'task' : 'tasks'}`
    : 'Import tasks';

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-6xl 2xl:max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-foreground">Easy Eisenhower</h1>
          <p className="text-muted-foreground lg:text-lg mt-1">
            Personal priority board for focus and clarity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            Import Tasks
          </Button>
        </div>
      </div>

      {totalItems === 0 && (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
          <p className="text-sm lg:text-base text-muted-foreground">
            Start by adding a task to any quadrant or import CRM tasks.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:gap-6 md:grid-cols-2">
        {QUADRANTS.map((quadrant) => {
          const items = itemsByQuadrant[quadrant.id];
          const Icon = quadrant.icon;
          return (
            <div
              key={quadrant.id}
              className={cn(
                'rounded-2xl border p-4 lg:p-5 flex flex-col gap-4 min-h-[320px]',
                quadrant.className
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-5 w-5', quadrant.accent)} />
                    <h2 className="text-base lg:text-lg font-semibold text-foreground">
                      {quadrant.title}
                    </h2>
                  </div>
                  <p className="text-xs lg:text-sm text-muted-foreground mt-1">
                    {quadrant.description}
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {items.length}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={drafts[quadrant.id]}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [quadrant.id]: event.target.value }))
                  }
                  placeholder="Add a task..."
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddItem(quadrant.id);
                    }
                  }}
                />
                <Button
                  size="icon"
                  onClick={() => handleAddItem(quadrant.id)}
                  aria-label={`Add task to ${quadrant.title}`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {items.length === 0 && (
                  <p className="text-xs lg:text-sm text-muted-foreground">
                    No items yet.
                  </p>
                )}
                {items.map((item) => {
                  const linkedTask = item.linkedTaskId ? tasksById.get(item.linkedTaskId) : undefined;
                  const contact = linkedTask ? contactsById.get(linkedTask.contactId) : undefined;
                  const isCompleted = linkedTask?.completed ?? item.completed;
                  const dueDate = linkedTask?.dueDate ? parseISO(linkedTask.dueDate) : null;
                  const isOverdue = dueDate ? isPast(dueDate) && !isToday(dueDate) : false;
                  const dueLabel = dueDate ? format(dueDate, 'MMM d') : null;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border bg-background/70 p-3',
                        isCompleted && 'opacity-60'
                      )}
                    >
                      <Checkbox
                        checked={isCompleted}
                        onCheckedChange={() => handleToggleComplete(item)}
                        aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            'text-sm lg:text-base font-medium text-foreground',
                            isCompleted && 'line-through text-muted-foreground'
                          )}
                        >
                          {linkedTask?.title || item.title}
                        </p>
                        {(contact || linkedTask?.dueDate) && (
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                            {contact && (
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() => navigate(`/contacts/${contact.id}`)}
                              >
                                {contact.fullName}
                              </button>
                            )}
                            {contact && contact.company && (
                              <span className="text-muted-foreground/70">• {contact.company}</span>
                            )}
                            {dueLabel && (
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full border px-2 py-0.5',
                                  isOverdue
                                    ? 'border-destructive/40 bg-destructive/10 text-destructive-foreground'
                                    : 'border-muted/60 bg-muted/40'
                                )}
                              >
                                {isOverdue ? 'Overdue' : `Due ${dueLabel}`}
                              </span>
                            )}
                          </div>
                        )}
                        {linkedTask && (
                          <Badge variant="outline" className="mt-2 text-[11px]">
                            Linked to CRM
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {linkedTask && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSelectedTask(linkedTask)}
                            aria-label="Open CRM task"
                          >
                            <ArrowUpRight className="h-4 w-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {QUADRANTS.map((target) => (
                              <DropdownMenuItem
                                key={target.id}
                                onClick={() => handleMove(item, target.id)}
                              >
                                Move to {target.title}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem
                              className="text-destructive-foreground"
                              onClick={() => deleteEisenhowerItem(item.id)}
                            >
                              Remove from matrix
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={importOpen} onOpenChange={handleImportOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import CRM tasks</DialogTitle>
            <DialogDescription>
              Select tasks to focus on and pick the quadrant to start them in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search tasks or contacts..."
              />
              <Select value={importQuadrant} onValueChange={(value) => setImportQuadrant(value as QuadrantId)}>
                <SelectTrigger className="sm:w-[240px]">
                  <SelectValue placeholder="Select quadrant" />
                </SelectTrigger>
                <SelectContent>
                  {QUADRANTS.map((quadrant) => (
                    <SelectItem key={quadrant.id} value={quadrant.id}>
                      {quadrant.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-[320px] overflow-y-auto space-y-2 rounded-lg border border-border bg-muted/20 p-3">
              {availableTasks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No available tasks to import.
                </p>
              )}
              {availableTasks.map((task) => {
                const contact = contactsById.get(task.contactId);
                const isSelected = selectedTaskIds.has(task.id);
                const dueDate = parseISO(task.dueDate);
                return (
                  <label
                    key={task.id}
                    className={cn(
                      'flex items-start gap-3 rounded-md border bg-background p-3 cursor-pointer',
                      isSelected && 'border-primary/50 bg-primary/5'
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        setSelectedTaskIds((prev) => {
                          const next = new Set(prev);
                          if (checked === true) {
                            next.add(task.id);
                          } else {
                            next.delete(task.id);
                          }
                          return next;
                        });
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{task.title}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                        {contact && (
                          <span>
                            {contact.fullName}{contact.company ? ` • ${contact.company}` : ''}
                          </span>
                        )}
                        <span>Due {format(dueDate, 'MMM d')}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={importCount === 0}
            >
              {importLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskDetailDialog
        task={selectedTask}
        contact={selectedTask ? contactsById.get(selectedTask.contactId) : undefined}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onContactClick={(contactId) => navigate(`/contacts/${contactId}`)}
        showContact
      />
    </div>
  );
}
