import { useDroppable } from '@dnd-kit/core';
import { Stage } from '@/types/crm';
import { cn } from '@/lib/utils';

interface DroppableStageProps {
  stage: Stage;
  contactCount: number;
  children: React.ReactNode;
}

export function DroppableStage({ stage, contactCount, children }: DroppableStageProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: stage.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-56 lg:w-60 flex-shrink-0 bg-muted/30 rounded-lg p-3 lg:p-4 transition-colors',
        isOver && 'bg-primary/10 ring-2 ring-primary ring-inset'
      )}
    >
      <div className="flex items-center justify-between mb-3 lg:mb-4">
        <div className="flex items-center gap-2">
          <div 
            className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full" 
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="font-semibold text-foreground lg:text-base">{stage.name}</h3>
        </div>
        <span className="text-xs lg:text-sm text-muted-foreground">
          {contactCount}
        </span>
      </div>
      {children}
    </div>
  );
}
