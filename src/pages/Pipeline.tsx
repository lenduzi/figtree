import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCRMContext } from '@/contexts/CRMContext';
import { ContactCard } from '@/components/ContactCard';
import { AddContactDialog } from '@/components/AddContactDialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { Contact } from '@/types/crm';
import { DroppableStage } from '@/components/DroppableStage';
import { DraggableContact } from '@/components/DraggableContact';

export default function Pipeline() {
  const navigate = useNavigate();
  const { contacts, stages, tasks, moveContactToStage, getStageById } = useCRMContext();
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  const getContactsByStage = (stageId: string) => {
    return contacts.filter(c => c.stageId === stageId);
  };

  const getOpenTaskCount = (contactId: string) => {
    return tasks.filter(t => t.contactId === contactId && !t.completed).length;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const contact = contacts.find(c => c.id === event.active.id);
    if (contact) {
      setActiveContact(contact);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveContact(null);

    if (over && active.id !== over.id) {
      const contactId = active.id as string;
      const newStageId = over.id as string;
      
      // Check if dropping on a stage
      const isStage = stages.some(s => s.id === newStageId);
      if (isStage) {
        moveContactToStage(contactId, newStageId);
      }
    }
  };

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-6xl 2xl:max-w-7xl mx-auto h-full">
      <div className="flex items-center justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-foreground">Pipeline</h1>
          <p className="text-muted-foreground lg:text-lg mt-1">
            Drag contacts between stages or click to view details
          </p>
        </div>
        <AddContactDialog />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <ScrollArea className="w-full pb-4">
          <div className="flex gap-4 lg:gap-6 min-w-max">
            {sortedStages.map((stage) => {
              const stageContacts = getContactsByStage(stage.id);
              return (
                <DroppableStage key={stage.id} stage={stage} contactCount={stageContacts.length}>
                  <div className="space-y-3 lg:space-y-4">
                    {stageContacts.map((contact) => (
                      <DraggableContact
                        key={contact.id}
                        contact={contact}
                        taskCount={getOpenTaskCount(contact.id)}
                        onClick={() => navigate(`/contacts/${contact.id}`)}
                      />
                    ))}

                    {stageContacts.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No contacts in this stage
                      </p>
                    )}
                  </div>
                </DroppableStage>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <DragOverlay>
          {activeContact ? (
            <ContactCard
              contact={activeContact}
              taskCount={getOpenTaskCount(activeContact.id)}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
