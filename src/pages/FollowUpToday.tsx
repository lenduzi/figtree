import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, AlertTriangle, Clock, CheckCircle2, Plus, Megaphone, Snowflake, ChevronRight } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { TaskItem } from '@/components/TaskItem';
import { TaskDetailDialog } from '@/components/TaskDetailDialog';
import { AddTaskWithContactDialog } from '@/components/AddTaskWithContactDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Task } from '@/types/crm';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { listDueOutreachLeads } from '@/lib/outreach-store';
import { COLD_AFTER_DAYS, getColdContacts } from '@/lib/follow-up-health';
import { cn, toLocalDateKey } from '@/lib/utils';

interface RecentlyCompleted {
  task: Task;
  completedAt: number;
}

const FIRST_TASK_NUDGE_KEY = 'simplecrm_first_task_nudge_seen';
const COLD_PREVIEW_LIMIT = 6;

const formatOutreachDue = (nextActionAt: string | null) => {
  if (!nextActionAt) return '';
  const days = differenceInCalendarDays(new Date(), new Date(nextActionAt));
  if (days <= 0) return 'Due today';
  return `${days} day${days !== 1 ? 's' : ''} overdue`;
};

export default function FollowUpToday() {
  const navigate = useNavigate();
  const { tasks, contacts, stages, meContactId, toggleTaskComplete, getContactById, rescheduleTask } = useCRMContext();
  // Outreach leads live outside the CRM context; this page remounts on navigation, so reading once is enough.
  const [dueOutreachLeads] = useState(() => listDueOutreachLeads());
  const coldContacts = useMemo(
    () => getColdContacts(contacts, tasks, stages, meContactId),
    [contacts, tasks, stages, meContactId],
  );
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [recentlyCompleted, setRecentlyCompleted] = useState<RecentlyCompleted[]>([]);
  const [showFirstTaskNudge, setShowFirstTaskNudge] = useState(false);

  const today = toLocalDateKey();
  const comingUpEnd = toLocalDateKey(addDays(new Date(), 7));

  // Clean up expired recently completed tasks
  useEffect(() => {
    if (recentlyCompleted.length === 0) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      setRecentlyCompleted(prev => 
        prev.filter(item => now - item.completedAt < 5000)
      );
    }, 500);

    return () => clearInterval(interval);
  }, [recentlyCompleted.length]);

  useEffect(() => {
    const hasAnyTasks = tasks.length > 0;
    if (hasAnyTasks) {
      try {
        localStorage.setItem(FIRST_TASK_NUDGE_KEY, '1');
      } catch {
        // ignore storage errors
      }
      setShowFirstTaskNudge(false);
      return;
    }
    try {
      const hasSeen = localStorage.getItem(FIRST_TASK_NUDGE_KEY) === '1';
      setShowFirstTaskNudge(!hasSeen);
    } catch {
      setShowFirstTaskNudge(false);
    }
  }, [tasks.length]);

  const handleToggleComplete = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task && !task.completed) {
      // Task is being completed - add to recently completed
      setRecentlyCompleted(prev => [
        ...prev.filter(item => item.task.id !== taskId),
        { task, completedAt: Date.now() }
      ]);
    } else {
      // Task is being uncompleted - remove from recently completed
      setRecentlyCompleted(prev => prev.filter(item => item.task.id !== taskId));
    }
    toggleTaskComplete(taskId);
  }, [tasks, toggleTaskComplete]);

  const handleUndoComplete = useCallback((taskId: string) => {
    setRecentlyCompleted(prev => prev.filter(item => item.task.id !== taskId));
    toggleTaskComplete(taskId);
  }, [toggleTaskComplete]);

  const handleNewTaskClick = () => {
    if (!showFirstTaskNudge) return;
    try {
      localStorage.setItem(FIRST_TASK_NUDGE_KEY, '1');
    } catch {
      // ignore storage errors
    }
    setShowFirstTaskNudge(false);
  };
  
  const openTasks = tasks.filter(t => !t.completed && t.dueDate);
  const overdueTasks = openTasks.filter(t => t.dueDate < today);
  const todayTasks = openTasks.filter(t => t.dueDate === today);
  const comingUpTasks = openTasks
    .filter(t => t.dueDate > today && t.dueDate <= comingUpEnd)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const totalActionItems = overdueTasks.length + todayTasks.length + dueOutreachLeads.length;

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-4xl lg:max-w-5xl 2xl:max-w-6xl mx-auto">
      <div className="mb-8 lg:mb-10">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">
              <span className="lg:hidden">
                Today{totalActionItems > 0 ? ` (${totalActionItems})` : ''}
              </span>
              <span className="hidden lg:inline">Follow-Up Today</span>
            </h1>
            <p className="text-muted-foreground lg:text-lg">
              <span className="lg:hidden">
                {totalActionItems === 0 ? "All clear for today." : `${totalActionItems} due now`}
              </span>
              <span className="hidden lg:inline">
                {totalActionItems === 0
                  ? "You're all caught up! No pending follow-ups."
                  : `${totalActionItems} action item${totalActionItems !== 1 ? 's' : ''} need your attention`
                }
              </span>
            </p>
            {showFirstTaskNudge && (
              <p className="text-xs text-muted-foreground lg:hidden">Tap + to create your first task</p>
            )}
          </div>
          <div className="hidden lg:flex flex-col items-end">
            <AddTaskWithContactDialog
              trigger={
                <Button
                  onClick={handleNewTaskClick}
                  className={cn(
                    "relative",
                    showFirstTaskNudge &&
                      "animate-heartbeat ring-2 ring-primary/25 ring-offset-2 ring-offset-background shadow-[0_0_12px_rgba(59,130,246,0.12)]",
                  )}
                >
                  {showFirstTaskNudge && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-1.5 rounded-lg bg-primary/5 blur-sm"
                    />
                  )}
                  <span className="relative z-10 flex items-center">
                    <Plus className="h-4 w-4 mr-2" />
                    New Task
                  </span>
                </Button>
              }
            />
            {showFirstTaskNudge && (
              <span className="mt-2 text-xs text-muted-foreground">Create your first task</span>
            )}
          </div>
        </div>
        <p className="mt-2 hidden text-xs lg:block lg:text-sm text-muted-foreground">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs lg:text-sm">⌘K</kbd> for Quick Actions
        </p>
      </div>

      <div className="grid gap-4 lg:gap-8 lg:grid-cols-2 items-stretch">
        <Card className="flex flex-col h-full">
          <CardHeader className="pb-3 lg:pb-4 lg:px-6">
            <CardTitle className="flex items-center gap-2 text-foreground text-lg lg:text-xl">
              <CalendarCheck className="h-5 w-5 lg:h-6 lg:w-6" />
              Today
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-5 lg:space-y-6 lg:px-6">
            {overdueTasks.length > 0 && (
              <div className="space-y-3 lg:space-y-4">
                <div className="flex items-center gap-2 text-sm lg:text-base text-destructive-foreground">
                  <AlertTriangle className="h-4 w-4 lg:h-5 lg:w-5" />
                  Overdue ({overdueTasks.length})
                </div>
                {overdueTasks.map(task => {
                  const contact = getContactById(task.contactId);
                  return (
                    <TaskItem
                      key={task.id}
                      task={task}
                      contact={contact}
                      onToggleComplete={handleToggleComplete}
                      onContactClick={(id) => navigate(`/contacts/${id}`)}
                      onReschedule={rescheduleTask}
                      onTaskClick={setSelectedTask}
                      showContact
                    />
                  );
                })}
              </div>
            )}

            {todayTasks.length > 0 && (
              <div className="space-y-3 lg:space-y-4">
                <div className="flex items-center gap-2 text-sm lg:text-base text-accent-foreground">
                  <CalendarCheck className="h-4 w-4 lg:h-5 lg:w-5" />
                  Due Today ({todayTasks.length})
                </div>
                {todayTasks.map(task => {
                  const contact = getContactById(task.contactId);
                  return (
                    <TaskItem
                      key={task.id}
                      task={task}
                      contact={contact}
                      onToggleComplete={handleToggleComplete}
                      onContactClick={(id) => navigate(`/contacts/${id}`)}
                      onReschedule={rescheduleTask}
                      onTaskClick={setSelectedTask}
                      showContact
                    />
                  );
                })}
              </div>
            )}

            {overdueTasks.length === 0 && todayTasks.length === 0 && (
              <div className="text-center py-6 lg:py-8">
                <CalendarCheck className="h-12 w-12 lg:h-14 lg:w-14 mx-auto text-muted-foreground/50 mb-3" />
                <h2 className="text-lg lg:text-xl font-semibold text-foreground mb-1">
                  {showFirstTaskNudge ? 'Create your first task' : 'All Clear!'}
                </h2>
                <p className="text-muted-foreground lg:text-base">
                  {showFirstTaskNudge
                    ? 'Add a contact and schedule a follow-up to get started.'
                    : 'You have no pending tasks. Add contacts and tasks to get started.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col h-full">
          <CardHeader className="pb-3 lg:pb-4 lg:px-6">
            <CardTitle className="flex items-center gap-2 text-muted-foreground text-lg lg:text-xl">
              <Clock className="h-5 w-5 lg:h-6 lg:w-6" />
              Coming Up
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-3 lg:space-y-4 lg:px-6">
            {comingUpTasks.map(task => {
              const contact = getContactById(task.contactId);
              return (
                <TaskItem
                  key={task.id}
                  task={task}
                  contact={contact}
                  onToggleComplete={toggleTaskComplete}
                  onContactClick={(id) => navigate(`/contacts/${id}`)}
                  onReschedule={rescheduleTask}
                  onTaskClick={setSelectedTask}
                  showContact
                />
              );
            })}
            {comingUpTasks.length === 0 && (
              <p className="text-center py-4 lg:py-6 text-sm lg:text-base text-muted-foreground">
                No tasks due in the next 7 days
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {(dueOutreachLeads.length > 0 || coldContacts.length > 0) && (
        <div className="mt-4 lg:mt-8 grid gap-4 lg:gap-8 lg:grid-cols-2 items-stretch">
          {dueOutreachLeads.length > 0 && (
            <Card className="flex flex-col h-full">
              <CardHeader className="pb-3 lg:pb-4 lg:px-6">
                <CardTitle className="flex items-center gap-2 text-foreground text-lg lg:text-xl">
                  <Megaphone className="h-5 w-5 lg:h-6 lg:w-6" />
                  Outreach Due ({dueOutreachLeads.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 space-y-2 lg:space-y-3 lg:px-6">
                {dueOutreachLeads.map((lead) => {
                  const dueLabel = formatOutreachDue(lead.nextActionAt);
                  return (
                    <button
                      key={lead.id}
                      onClick={() => navigate(`/outreach?lead=${lead.id}`)}
                      className="w-full text-left p-3 lg:p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm lg:text-base font-medium text-foreground truncate">
                            {lead.venueName || 'Untitled lead'}
                          </p>
                          <p className="text-xs lg:text-sm text-muted-foreground truncate">
                            {[lead.nextAction, lead.city].filter(Boolean).join(' • ')}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'text-xs lg:text-sm shrink-0',
                            dueLabel === 'Due today' ? 'text-accent-foreground' : 'text-destructive-foreground',
                          )}
                        >
                          {dueLabel}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {coldContacts.length > 0 && (
            <Card className="flex flex-col h-full">
              <CardHeader className="pb-3 lg:pb-4 lg:px-6">
                <CardTitle className="flex items-center gap-2 text-foreground text-lg lg:text-xl">
                  <Snowflake className="h-5 w-5 lg:h-6 lg:w-6" />
                  Going Cold ({coldContacts.length})
                </CardTitle>
                <p className="text-xs lg:text-sm text-muted-foreground">
                  Open deals with no task planned and no touch in {COLD_AFTER_DAYS}+ days
                </p>
              </CardHeader>
              <CardContent className="flex-1 space-y-2 lg:space-y-3 lg:px-6">
                {coldContacts.slice(0, COLD_PREVIEW_LIMIT).map(({ contact, daysSinceTouch }) => (
                  <button
                    key={contact.id}
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                    className="w-full text-left p-3 lg:p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm lg:text-base font-medium text-foreground truncate">
                          {contact.fullName}
                        </p>
                        <p className="text-xs lg:text-sm text-muted-foreground truncate">
                          {contact.company || 'No company'}
                        </p>
                      </div>
                      <span className="text-xs lg:text-sm text-amber-600 dark:text-amber-300 shrink-0">
                        {daysSinceTouch}d quiet
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </button>
                ))}
                {coldContacts.length > COLD_PREVIEW_LIMIT && (
                  <button
                    onClick={() => navigate('/contacts')}
                    className="w-full text-center text-xs lg:text-sm text-muted-foreground hover:text-foreground py-1"
                  >
                    +{coldContacts.length - COLD_PREVIEW_LIMIT} more in Contacts
                  </button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {recentlyCompleted.length > 0 && (
        <Card className="mt-6 lg:mt-8 border-muted bg-muted/30">
          <CardHeader className="pb-3 lg:pb-4 lg:px-6">
            <CardTitle className="flex items-center gap-2 text-muted-foreground text-base lg:text-lg font-medium">
              <CheckCircle2 className="h-4 w-4 lg:h-5 lg:w-5" />
              Just Completed
              <span className="text-xs font-normal">(click to undo)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 lg:space-y-3 lg:px-6">
            {recentlyCompleted.map(({ task }) => {
              const contact = getContactById(task.contactId);
              return (
                <button
                  key={task.id}
                  onClick={() => handleUndoComplete(task.id)}
                  className="w-full text-left p-3 lg:p-4 rounded-lg bg-background/50 border border-border/50 hover:bg-background hover:border-border transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm lg:text-base text-muted-foreground line-through truncate">
                        {task.title}
                      </p>
                      {contact && (
                        <p className="text-xs lg:text-sm text-muted-foreground/70">
                          {contact.fullName}{contact.company ? ` • ${contact.company}` : ''}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground/50 group-hover:text-primary transition-colors">
                      Undo
                    </span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      <TaskDetailDialog
        task={selectedTask}
        contact={selectedTask ? getContactById(selectedTask.contactId) : undefined}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onContactClick={(id) => navigate(`/contacts/${id}`)}
        showContact
      />

      <div className="fixed lg:hidden right-[calc(1.25rem+env(safe-area-inset-right))] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40">
        <AddTaskWithContactDialog
          trigger={
            <Button
              aria-label="New Task"
              onClick={handleNewTaskClick}
              className={cn(
                "relative h-12 w-12 rounded-full shadow-lg px-0",
                showFirstTaskNudge &&
                  "animate-heartbeat ring-2 ring-primary/25 ring-offset-2 ring-offset-background shadow-[0_0_12px_rgba(59,130,246,0.12)]",
              )}
            >
              {showFirstTaskNudge && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-1.5 rounded-full bg-primary/5 blur-sm"
                />
              )}
              <Plus className="h-5 w-5" />
            </Button>
          }
        />
      </div>
    </div>
  );
}
