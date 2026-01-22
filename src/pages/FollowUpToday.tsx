import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, AlertTriangle, Clock, CheckCircle2, Plus } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { TaskItem } from '@/components/TaskItem';
import { TaskDetailDialog } from '@/components/TaskDetailDialog';
import { AddTaskWithContactDialog } from '@/components/AddTaskWithContactDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Task } from '@/types/crm';
import { addDays } from 'date-fns';

interface RecentlyCompleted {
  task: Task;
  completedAt: number;
}

export default function FollowUpToday() {
  const navigate = useNavigate();
  const { tasks, contacts, toggleTaskComplete, getContactById, rescheduleTask } = useCRMContext();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [recentlyCompleted, setRecentlyCompleted] = useState<RecentlyCompleted[]>([]);

  const today = new Date().toISOString().split('T')[0];
  const comingUpEnd = addDays(new Date(), 7).toISOString().split('T')[0];

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
  
  const openTasks = tasks.filter(t => !t.completed && t.dueDate);
  const overdueTasks = openTasks.filter(t => t.dueDate < today);
  const todayTasks = openTasks.filter(t => t.dueDate === today);
  const comingUpTasks = openTasks
    .filter(t => t.dueDate > today && t.dueDate <= comingUpEnd)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const totalActionItems = overdueTasks.length + todayTasks.length;

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-4xl lg:max-w-5xl 2xl:max-w-6xl mx-auto">
      <div className="mb-8 lg:mb-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground">Follow-Up Today</h1>
            <p className="text-muted-foreground lg:text-lg mt-1">
              {totalActionItems === 0 
                ? "You're all caught up! No pending follow-ups."
                : `${totalActionItems} action item${totalActionItems !== 1 ? 's' : ''} need your attention`
              }
            </p>
          </div>
          <AddTaskWithContactDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </Button>
            }
          />
        </div>
        <p className="text-xs lg:text-sm text-muted-foreground mt-2">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs lg:text-sm">⌘K</kbd> to search
        </p>
      </div>

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-2 items-stretch">
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
                <h2 className="text-lg lg:text-xl font-semibold text-foreground mb-1">All Clear!</h2>
                <p className="text-muted-foreground lg:text-base">
                  You have no pending tasks. Add contacts and tasks to get started.
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
              <p className="text-center py-6 text-muted-foreground">No tasks due in the next 7 days</p>
            )}
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}
