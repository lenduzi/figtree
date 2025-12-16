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
        'w-72 lg:w-80 xl:w-96 flex-shrink-0 bg-muted/30 rounded-lg p-4 lg:p-5 transition-colors',
        isOver && 'bg-primary/10 ring-2 ring-primary ring-inset'
      )}
    >
      <div className="flex items-center justify-between mb-4 lg:mb-5">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 lg:w-4 lg:h-4 rounded-full" 
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="font-semibold text-foreground lg:text-lg">{stage.name}</h3>
        </div>
        <span className="text-sm lg:text-base text-muted-foreground">
          {contactCount}
        </span>
      </div>
      {children}
    </div>
  );
}
