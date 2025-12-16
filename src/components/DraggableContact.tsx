import { useDraggable } from '@dnd-kit/core';
import { Contact } from '@/types/crm';
import { ContactCard } from '@/components/ContactCard';
import { cn } from '@/lib/utils';

interface DraggableContactProps {
  contact: Contact;
  taskCount: number;
  onClick: () => void;
}

export function DraggableContact({ contact, taskCount, onClick }: DraggableContactProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: contact.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'touch-none',
        isDragging && 'opacity-50'
      )}
      onClick={(e) => {
        // Only trigger click if not dragging
        if (!isDragging) {
          onClick();
        }
      }}
    >
      <ContactCard
        contact={contact}
        taskCount={taskCount}
      />
    </div>
  );
}
