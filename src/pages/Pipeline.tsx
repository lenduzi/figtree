import { useNavigate } from 'react-router-dom';
import { useCRMContext } from '@/contexts/CRMContext';
import { ContactCard } from '@/components/ContactCard';
import { AddContactDialog } from '@/components/AddContactDialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Pipeline() {
  const navigate = useNavigate();
  const { contacts, stages, tasks, moveContactToStage, getStageById } = useCRMContext();

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  const getContactsByStage = (stageId: string) => {
    return contacts.filter(c => c.stageId === stageId);
  };

  const getOpenTaskCount = (contactId: string) => {
    return tasks.filter(t => t.contactId === contactId && !t.completed).length;
  };

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            Drag contacts or use dropdown to move between stages
          </p>
        </div>
        <AddContactDialog />
      </div>

      <ScrollArea className="w-full pb-4">
        <div className="flex gap-4 min-w-max">
          {sortedStages.map((stage) => {
            const stageContacts = getContactsByStage(stage.id);
            return (
              <div
                key={stage.id}
                className="w-72 flex-shrink-0 bg-muted/30 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: stage.color }}
                    />
                    <h3 className="font-semibold text-foreground">{stage.name}</h3>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {stageContacts.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {stageContacts.map((contact) => (
                    <div key={contact.id} className="space-y-2">
                      <ContactCard
                        contact={contact}
                        taskCount={getOpenTaskCount(contact.id)}
                        onClick={() => navigate(`/contacts/${contact.id}`)}
                      />
                      <Select
                        value={contact.stageId}
                        onValueChange={(newStageId) => moveContactToStage(contact.id, newStageId)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Move to..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sortedStages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}

                  {stageContacts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No contacts in this stage
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
