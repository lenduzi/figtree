import { Building2, Mail, Phone, Clock, User } from 'lucide-react';
import { Contact, Stage } from '@/types/crm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { forwardRef } from 'react';
import { useCRMContext } from '@/contexts/CRMContext';

interface ContactCardProps {
  contact: Contact;
  stage?: Stage;
  taskCount?: number;
  onClick?: () => void;
  isDragging?: boolean;
}

export const ContactCard = forwardRef<HTMLDivElement, ContactCardProps>(
  ({ contact, stage, taskCount = 0, onClick, isDragging }, ref) => {
    const { meContactId } = useCRMContext();
    const isMe = contact.id === meContactId;

    return (
      <Card 
        ref={ref}
        className={`cursor-pointer hover:shadow-md transition-shadow bg-card ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
        onClick={onClick}
      >
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-semibold text-foreground lg:text-lg truncate">{contact.fullName}</h3>
                {isMe && (
                  <Badge variant="outline" className="px-1.5 py-0.5">
                    <User className="h-3 w-3" />
                    <span className="sr-only">Me</span>
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm lg:text-base text-muted-foreground mt-1">
                <Building2 className="h-3 w-3 lg:h-4 lg:w-4 shrink-0" />
                <span className="truncate">{contact.company || 'No company'}</span>
              </div>
            </div>
            {stage && (
              <Badge 
                variant="secondary" 
                className="shrink-0 text-xs lg:text-sm"
                style={{ 
                  backgroundColor: `${stage.color}20`,
                  color: stage.color,
                  borderColor: stage.color 
                }}
              >
                {stage.name}
              </Badge>
            )}
          </div>

          <div className="mt-3 space-y-1 text-xs lg:text-sm text-muted-foreground">
            {contact.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3 lg:h-4 lg:w-4" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3 lg:h-4 lg:w-4" />
                <span>{contact.phone}</span>
              </div>
            )}
          </div>

          <div className="mt-3 lg:mt-4 pt-3 lg:pt-4 border-t border-border flex items-center justify-between">
            {contact.lastInteractionDate ? (
              <span className="text-xs lg:text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 lg:h-4 lg:w-4" />
                {formatDistanceToNow(new Date(contact.lastInteractionDate), { addSuffix: true })}
              </span>
            ) : (
              <span className="text-xs lg:text-sm text-muted-foreground">No interactions yet</span>
            )}
            {taskCount > 0 && (
              <span className="text-xs lg:text-sm text-muted-foreground">
                {taskCount} task{taskCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);

ContactCard.displayName = 'ContactCard';
