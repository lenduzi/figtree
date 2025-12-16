import { useNavigate } from 'react-router-dom';
import { CalendarCheck, AlertTriangle, Clock, ChevronRight } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { TaskItem } from '@/components/TaskItem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function FollowUpToday() {
  const navigate = useNavigate();
  const { tasks, contacts, toggleTaskComplete, getContactById, rescheduleTask } = useCRMContext();

  const today = new Date().toISOString().split('T')[0];
  
  const openTasks = tasks.filter(t => !t.completed);
  const overdueTasks = openTasks.filter(t => t.dueDate < today);
  const todayTasks = openTasks.filter(t => t.dueDate === today);
  const upcomingTasks = openTasks.filter(t => t.dueDate > today).slice(0, 5);

  const totalActionItems = overdueTasks.length + todayTasks.length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Follow-Up Today</h1>
        <p className="text-muted-foreground mt-1">
          {totalActionItems === 0 
            ? "You're all caught up! No pending follow-ups."
            : `${totalActionItems} action item${totalActionItems !== 1 ? 's' : ''} need your attention`
          }
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">⌘K</kbd> to search
        </p>
      </div>

      {overdueTasks.length > 0 && (
        <Card className="mb-6 border-destructive">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive-foreground">
              <AlertTriangle className="h-5 w-5" />
              Overdue ({overdueTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overdueTasks.map(task => {
              const contact = getContactById(task.contactId);
              return (
                <TaskItem
                  key={task.id}
                  task={task}
                  contact={contact}
                  onToggleComplete={toggleTaskComplete}
                  onContactClick={(id) => navigate(`/contacts/${id}`)}
                  onReschedule={rescheduleTask}
                  showContact
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      {todayTasks.length > 0 && (
        <Card className="mb-6 border-accent">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-accent-foreground">
              <CalendarCheck className="h-5 w-5" />
              Due Today ({todayTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayTasks.map(task => {
              const contact = getContactById(task.contactId);
              return (
                <TaskItem
                  key={task.id}
                  task={task}
                  contact={contact}
                  onToggleComplete={toggleTaskComplete}
                  onContactClick={(id) => navigate(`/contacts/${id}`)}
                  onReschedule={rescheduleTask}
                  showContact
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      {upcomingTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-5 w-5" />
              Coming Up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingTasks.map(task => {
              const contact = getContactById(task.contactId);
              return (
                <TaskItem
                  key={task.id}
                  task={task}
                  contact={contact}
                  onToggleComplete={toggleTaskComplete}
                  onContactClick={(id) => navigate(`/contacts/${id}`)}
                  onReschedule={rescheduleTask}
                  showContact
                />
              );
            })}
            {tasks.filter(t => !t.completed && t.dueDate > today).length > 5 && (
              <button
                onClick={() => navigate('/reminders')}
                className="flex items-center gap-1 text-sm text-primary hover:underline mt-2"
              >
                View all reminders
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {totalActionItems === 0 && upcomingTasks.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <CalendarCheck className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">All Clear!</h2>
            <p className="text-muted-foreground">
              You have no pending tasks. Add contacts and tasks to get started.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
