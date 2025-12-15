import { Building2, Mail, Phone } from 'lucide-react';
import { Contact, Stage } from '@/types/crm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ContactCardProps {
  contact: Contact;
  stage?: Stage;
  taskCount?: number;
  onClick?: () => void;
}

export function ContactCard({ contact, stage, taskCount = 0, onClick }: ContactCardProps) {
  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow bg-card"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground truncate">{contact.fullName}</h3>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{contact.company || 'No company'}</span>
            </div>
          </div>
          {stage && (
            <Badge 
              variant="secondary" 
              className="shrink-0 text-xs"
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

        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {contact.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3 w-3" />
              <span className="truncate">{contact.email}</span>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3" />
              <span>{contact.phone}</span>
            </div>
          )}
        </div>

        {taskCount > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {taskCount} open task{taskCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
