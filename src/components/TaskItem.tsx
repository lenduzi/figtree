import { format, isToday, isPast, parseISO } from 'date-fns';
import { Check, Calendar, Clock, Trash2 } from 'lucide-react';
import { Task, Contact } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TaskItemProps {
  task: Task;
  contact?: Contact;
  onToggleComplete: (id: string) => void;
  onDelete?: (id: string) => void;
  onContactClick?: (contactId: string) => void;
  showContact?: boolean;
}

export function TaskItem({ 
  task, 
  contact, 
  onToggleComplete, 
  onDelete,
  onContactClick,
  showContact = false 
}: TaskItemProps) {
  const dueDate = parseISO(task.dueDate);
  const isOverdue = isPast(dueDate) && !isToday(dueDate);
  const isDueToday = isToday(dueDate);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-colors',
        task.completed && 'opacity-60 bg-muted/50',
        !task.completed && isOverdue && 'border-destructive bg-destructive/10',
        !task.completed && isDueToday && 'border-accent bg-accent/20'
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'h-6 w-6 rounded-full border-2 shrink-0',
          task.completed ? 'bg-primary border-primary' : 'border-muted-foreground'
        )}
        onClick={() => onToggleComplete(task.id)}
      >
        {task.completed && <Check className="h-3 w-3 text-primary-foreground" />}
      </Button>

      <div className="flex-1 min-w-0">
        <p className={cn(
          'font-medium text-sm',
          task.completed && 'line-through text-muted-foreground'
        )}>
          {task.title}
        </p>
        
        {task.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {task.description}
          </p>
        )}

        {showContact && contact && (
          <button
            onClick={() => onContactClick?.(contact.id)}
            className="text-xs text-primary hover:underline mt-1 block"
          >
            {contact.fullName} • {contact.company}
          </button>
        )}

        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className={cn(
            'flex items-center gap-1',
            !task.completed && isOverdue && 'text-destructive-foreground font-medium',
            !task.completed && isDueToday && 'text-accent-foreground font-medium'
          )}>
            <Calendar className="h-3 w-3" />
            {isOverdue && !task.completed ? 'Overdue: ' : ''}
            {isDueToday && !task.completed ? 'Today' : format(dueDate, 'MMM d, yyyy')}
          </span>
          {task.dueTime && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {task.dueTime}
            </span>
          )}
        </div>
      </div>

      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive-foreground"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
