import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, CalendarCheck, Clock, CheckCircle } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { TaskItem } from '@/components/TaskItem';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export default function Reminders() {
  const navigate = useNavigate();
  const { tasks, toggleTaskComplete, getContactById } = useCRMContext();

  const today = new Date().toISOString().split('T')[0];
  
  const overdueTasks = tasks.filter(t => !t.completed && t.dueDate < today);
  const todayTasks = tasks.filter(t => !t.completed && t.dueDate === today);
  const upcomingTasks = tasks.filter(t => !t.completed && t.dueDate > today);
  const completedTasks = tasks.filter(t => t.completed);

  const sortByDate = (a: typeof tasks[0], b: typeof tasks[0]) => 
    new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">All Reminders</h1>
        <p className="text-muted-foreground mt-1">
          Manage all your tasks and follow-ups
        </p>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            All
            <Badge variant="secondary" className="ml-1">
              {overdueTasks.length + todayTasks.length + upcomingTasks.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="overdue" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Overdue
            {overdueTasks.length > 0 && (
              <Badge variant="destructive" className="ml-1">{overdueTasks.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Done
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3">
          {[...overdueTasks, ...todayTasks, ...upcomingTasks]
            .sort(sortByDate)
            .map(task => (
              <TaskItem
                key={task.id}
                task={task}
                contact={getContactById(task.contactId)}
                onToggleComplete={toggleTaskComplete}
                onContactClick={(id) => navigate(`/contacts/${id}`)}
                showContact
              />
            ))}
          {overdueTasks.length + todayTasks.length + upcomingTasks.length === 0 && (
            <p className="text-center py-12 text-muted-foreground">No pending tasks</p>
          )}
        </TabsContent>

        <TabsContent value="overdue" className="space-y-3">
          {overdueTasks.sort(sortByDate).map(task => (
            <TaskItem
              key={task.id}
              task={task}
              contact={getContactById(task.contactId)}
              onToggleComplete={toggleTaskComplete}
              onContactClick={(id) => navigate(`/contacts/${id}`)}
              showContact
            />
          ))}
          {overdueTasks.length === 0 && (
            <p className="text-center py-12 text-muted-foreground">No overdue tasks</p>
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-3">
          {upcomingTasks.sort(sortByDate).map(task => (
            <TaskItem
              key={task.id}
              task={task}
              contact={getContactById(task.contactId)}
              onToggleComplete={toggleTaskComplete}
              onContactClick={(id) => navigate(`/contacts/${id}`)}
              showContact
            />
          ))}
          {upcomingTasks.length === 0 && (
            <p className="text-center py-12 text-muted-foreground">No upcoming tasks</p>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-3">
          {completedTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              contact={getContactById(task.contactId)}
              onToggleComplete={toggleTaskComplete}
              onContactClick={(id) => navigate(`/contacts/${id}`)}
              showContact
            />
          ))}
          {completedTasks.length === 0 && (
            <p className="text-center py-12 text-muted-foreground">No completed tasks</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
