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
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useMediaQuery } from '@/hooks/useMediaQuery';

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
  const isMobile = useMediaQuery("(max-width: 639px)");
  
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

  const handleRescheduleOpenChange = (open: boolean) => {
    setRescheduleOpen(open);
    if (!open) {
      setShowCalendar(false);
    }
  };

  const rescheduleContent = (
    <div className={cn("flex flex-col gap-2", isMobile && "pt-1")}>
      {isMobile && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Reschedule</p>
          {showCalendar && (
            <Button
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() => setShowCalendar(false)}
            >
              Quick options
            </Button>
          )}
        </div>
      )}
      {showCalendar ? (
        <div className="flex flex-col items-center gap-2">
          <CalendarPicker
            mode="single"
            selected={dueDate}
            onSelect={handleDateSelect}
            initialFocus
            className="w-full max-w-xs"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-11 justify-start text-base sm:h-9 sm:text-sm"
            onClick={() => handleQuickReschedule(1)}
          >
            Tomorrow
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 justify-start text-base sm:h-9 sm:text-sm"
            onClick={() => handleQuickReschedule(3)}
          >
            In 3 Days
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 justify-start text-base sm:h-9 sm:text-sm"
            onClick={() => handleQuickReschedule(7)}
          >
            Next Week
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 justify-start text-base sm:h-9 sm:text-sm"
            onClick={() => setShowCalendar(true)}
          >
            Pick Date...
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'flex items-start gap-4 p-4 lg:gap-4 lg:p-4 rounded-2xl lg:rounded-lg border bg-background transition-colors shadow-sm lg:shadow-none',
        task.completed && 'opacity-60 bg-muted/50',
        !task.completed && isOverdue && 'border-destructive bg-destructive/10',
        !task.completed && isDueToday && 'border-accent bg-accent/20'
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'h-8 w-8 lg:h-7 lg:w-7 rounded-full border-2 shrink-0 touch-manipulation',
          task.completed ? 'bg-primary border-primary' : 'border-muted-foreground'
        )}
        onClick={() => onToggleComplete(task.id)}
        aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
      >
        {task.completed && <Check className="h-4 w-4 lg:h-4 lg:w-4 text-primary-foreground" />}
      </Button>

      <div 
        className={cn(
          "flex-1 min-w-0",
          onTaskClick && "cursor-pointer hover:bg-muted/50 -m-2 p-2 rounded-lg transition-colors"
        )}
        onClick={() => onTaskClick?.(task)}
      >
        <p className={cn(
          'font-semibold text-base lg:text-base tracking-tight',
          task.completed && 'line-through text-muted-foreground'
        )}>
          {task.title}
        </p>
        
        {task.description && (
          <p className="text-sm lg:text-sm text-muted-foreground mt-1.5 line-clamp-2">
            {task.description}
          </p>
        )}

        {showContact && contact && (
          <button
            onClick={() => onContactClick?.(contact.id)}
            className="text-sm lg:text-sm text-primary hover:underline mt-2 block"
          >
            {contact.fullName} • {contact.company}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs lg:text-sm text-muted-foreground">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
            !task.completed && isOverdue && 'border-destructive/40 bg-destructive/10 text-destructive-foreground',
            !task.completed && isDueToday && 'border-accent/40 bg-accent/15 text-accent-foreground',
            !isOverdue && !isDueToday && 'border-muted/60 bg-muted/40'
          )}>
            <Calendar className="h-3 w-3 lg:h-4 lg:w-4" />
            {isOverdue && !task.completed ? 'Overdue' : isDueToday && !task.completed ? 'Today' : format(dueDate, 'MMM d, yyyy')}
          </span>
          {task.dueTime && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-muted/60 bg-muted/40 px-2.5 py-1">
              <Clock className="h-3 w-3 lg:h-4 lg:w-4" />
              {task.dueTime}
            </span>
          )}
        </div>
      </div>

      {onReschedule && !task.completed && (
        <>
          {isMobile ? (
            <Dialog open={rescheduleOpen} onOpenChange={handleRescheduleOpenChange}>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 lg:h-9 lg:w-9 text-muted-foreground hover:text-foreground"
                onClick={() => setRescheduleOpen(true)}
              >
                <CalendarClock className="h-4 w-4 lg:h-5 lg:w-5" />
              </Button>
              <DialogContent className="sm:max-w-sm">
                {rescheduleContent}
              </DialogContent>
            </Dialog>
          ) : (
            <Popover open={rescheduleOpen} onOpenChange={handleRescheduleOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 lg:h-9 lg:w-9 text-muted-foreground hover:text-foreground"
                >
                  <CalendarClock className="h-4 w-4 lg:h-5 lg:w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="end">
                {rescheduleContent}
              </PopoverContent>
            </Popover>
          )}
        </>
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
