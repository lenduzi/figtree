import { useState } from 'react';
import { format, isToday, isPast, parseISO, addDays } from 'date-fns';
import { Check, Calendar, Clock, Trash2, CalendarClock } from 'lucide-react';
import { Task, Contact } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';

interface TaskItemProps {
  task: Task;
  contact?: Contact;
  onToggleComplete: (id: string) => void;
  onDelete?: (id: string) => void;
  onContactClick?: (contactId: string) => void;
  onReschedule?: (id: string, newDate: Date) => void;
  onTaskClick?: (task: Task) => void;
  showContact?: boolean;
}

export function TaskItem({ 
  task, 
  contact, 
  onToggleComplete, 
  onDelete,
  onContactClick,
  onReschedule,
  onTaskClick,
  showContact = false 
}: TaskItemProps) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  
  const dueDate = parseISO(task.dueDate);
  const isOverdue = isPast(dueDate) && !isToday(dueDate);
  const isDueToday = isToday(dueDate);

  const handleQuickReschedule = (days: number) => {
    if (onReschedule) {
      onReschedule(task.id, addDays(new Date(), days));
    }
    setRescheduleOpen(false);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date && onReschedule) {
      onReschedule(task.id, date);
    }
    setShowCalendar(false);
    setRescheduleOpen(false);
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 lg:gap-4 p-3 lg:p-4 rounded-lg border transition-colors',
        task.completed && 'opacity-60 bg-muted/50',
        !task.completed && isOverdue && 'border-destructive bg-destructive/10',
        !task.completed && isDueToday && 'border-accent bg-accent/20'
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'h-6 w-6 lg:h-7 lg:w-7 rounded-full border-2 shrink-0',
          task.completed ? 'bg-primary border-primary' : 'border-muted-foreground'
        )}
        onClick={() => onToggleComplete(task.id)}
      >
        {task.completed && <Check className="h-3 w-3 lg:h-4 lg:w-4 text-primary-foreground" />}
      </Button>

      <div 
        className={cn(
          "flex-1 min-w-0",
          onTaskClick && "cursor-pointer hover:bg-muted/50 -m-2 p-2 rounded-md transition-colors"
        )}
        onClick={() => onTaskClick?.(task)}
      >
        <p className={cn(
          'font-medium text-sm lg:text-base',
          task.completed && 'line-through text-muted-foreground'
        )}>
          {task.title}
        </p>
        
        {task.description && (
          <p className="text-xs lg:text-sm text-muted-foreground mt-1 line-clamp-2">
            {task.description}
          </p>
        )}

        {showContact && contact && (
          <button
            onClick={() => onContactClick?.(contact.id)}
            className="text-xs lg:text-sm text-primary hover:underline mt-1 block"
          >
            {contact.fullName} • {contact.company}
          </button>
        )}

        <div className="flex items-center gap-3 mt-2 text-xs lg:text-sm text-muted-foreground">
          <span className={cn(
            'flex items-center gap-1',
            !task.completed && isOverdue && 'text-destructive-foreground font-medium',
            !task.completed && isDueToday && 'text-accent-foreground font-medium'
          )}>
            <Calendar className="h-3 w-3 lg:h-4 lg:w-4" />
            {isOverdue && !task.completed ? 'Overdue: ' : ''}
            {isDueToday && !task.completed ? 'Today' : format(dueDate, 'MMM d, yyyy')}
          </span>
          {task.dueTime && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 lg:h-4 lg:w-4" />
              {task.dueTime}
            </span>
          )}
        </div>
      </div>

      {onReschedule && !task.completed && (
        <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:h-9 lg:w-9 text-muted-foreground hover:text-foreground"
            >
              <CalendarClock className="h-4 w-4 lg:h-5 lg:w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="end">
            {showCalendar ? (
              <CalendarPicker
                mode="single"
                selected={dueDate}
                onSelect={handleDateSelect}
                initialFocus
              />
            ) : (
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => handleQuickReschedule(1)}
                >
                  Tomorrow
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => handleQuickReschedule(3)}
                >
                  In 3 Days
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => handleQuickReschedule(7)}
                >
                  Next Week
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => setShowCalendar(true)}
                >
                  Pick Date...
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}

      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 lg:h-9 lg:w-9 text-muted-foreground hover:text-destructive-foreground"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 className="h-4 w-4 lg:h-5 lg:w-5" />
        </Button>
      )}
    </div>
  );
}
