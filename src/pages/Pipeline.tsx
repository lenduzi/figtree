import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { ContactCard } from '@/components/ContactCard';
import { AddContactDialog } from '@/components/AddContactDialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

export default function Pipeline() {
  const navigate = useNavigate();
  const { contacts, stages, tasks, moveContactToStage } = useCRMContext();
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [moveContact, setMoveContact] = useState<Contact | null>(null);
  const isMobile = useMediaQuery("(max-width: 639px)");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const stageContacts = sortedStages.map((stage) => ({
    stage,
    contacts: contacts.filter(c => c.stageId === stage.id),
  }));

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
      <AddContactDialog open={addContactOpen} onOpenChange={setAddContactOpen} triggerless />
      <Dialog open={!!moveContact} onOpenChange={(open) => !open && setMoveContact(null)}>
        <DialogContent className="sm:max-w-sm">
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Move to stage</h2>
            <div className="grid gap-2">
              {sortedStages.map((stage) => (
                <Button
                  key={stage.id}
                  variant={moveContact?.stageId === stage.id ? "secondary" : "outline"}
                  className="justify-start"
                  onClick={() => {
                    if (!moveContact) return;
                    moveContactToStage(moveContact.id, stage.id);
                    setMoveContact(null);
                  }}
                  disabled={moveContact?.stageId === stage.id}
                >
                  <span
                    className="mr-2 h-2 w-2 rounded-full"
                    style={{ backgroundColor: stage.color }}
                    aria-hidden
                  />
                  {stage.name}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="sr-only sm:not-sr-only text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">Pipeline</h1>
          <p className="text-muted-foreground lg:text-lg mt-1 hidden sm:block">
            Drag contacts between stages or click to view details
          </p>
          <p className="text-muted-foreground mt-1 sm:hidden">
            Tap a contact to view details
          </p>
        </div>
        <Button className="hidden sm:inline-flex" onClick={() => setAddContactOpen(true)}>
          Add Contact
        </Button>
      </div>

      {isMobile ? (
        <Accordion
          type="multiple"
          defaultValue={stageContacts.filter((item) => item.contacts.length > 0).map((item) => item.stage.id)}
          className="space-y-2"
        >
          {stageContacts.map(({ stage, contacts }) => (
            <AccordionItem key={stage.id} value={stage.id} className="rounded-xl border bg-card px-4">
              <AccordionTrigger className="py-3 no-underline hover:no-underline">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="font-semibold text-foreground">{stage.name}</span>
                </div>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {contacts.length}
                </Badge>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="space-y-2">
                  {contacts.map((contact) => {
                    const taskCount = getOpenTaskCount(contact.id);
                    return (
                      <div
                        key={contact.id}
                        className="rounded-lg border bg-background p-3 shadow-sm"
                        onClick={() => navigate(`/contacts/${contact.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            navigate(`/contacts/${contact.id}`);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {contact.fullName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {contact.company || "No company"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {taskCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {taskCount}
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className={cn("h-8 px-2 text-xs")}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoveContact(contact);
                              }}
                            >
                              Move
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {contacts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No contacts in this stage
                    </p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <ScrollArea className="w-full pb-4">
            <div className="flex gap-4 lg:gap-6 min-w-max">
              {stageContacts.map(({ stage, contacts }) => (
                <DroppableStage key={stage.id} stage={stage} contactCount={contacts.length}>
                  <div className="space-y-3 lg:space-y-4">
                    {contacts.map((contact) => (
                      <DraggableContact
                        key={contact.id}
                        contact={contact}
                        taskCount={getOpenTaskCount(contact.id)}
                        onClick={() => navigate(`/contacts/${contact.id}`)}
                      />
                    ))}

                    {contacts.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No contacts in this stage
                      </p>
                    )}
                  </div>
                </DroppableStage>
              ))}
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
      )}

      <Button
        className="sm:hidden fixed right-[calc(1.25rem+env(safe-area-inset-right))] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] h-12 w-12 rounded-full p-0 shadow-lg"
        onClick={() => setAddContactOpen(true)}
        aria-label="Add Contact"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}
