export interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface Task {
  id: string;
  contactId: string;
  title: string;
  description?: string;
  dueDate: string;
  dueTime?: string;
  hasReminder: boolean;
  completed: boolean;
  createdAt: string;
}

export interface Contact {
  id: string;
  fullName: string;
  company: string;
  email: string;
  phone: string;
  stageId: string;
  notes: string;
  notesLastEdited?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_STAGES: Stage[] = [
  { id: 'lead', name: 'Lead', color: 'hsl(var(--chart-1))', order: 0 },
  { id: 'contacted', name: 'Contacted', color: 'hsl(var(--chart-2))', order: 1 },
  { id: 'call-scheduled', name: 'Call Scheduled', color: 'hsl(var(--chart-3))', order: 2 },
  { id: 'proposal-sent', name: 'Proposal Sent', color: 'hsl(var(--chart-4))', order: 3 },
  { id: 'negotiation', name: 'Negotiation', color: 'hsl(var(--chart-5))', order: 4 },
  { id: 'won', name: 'Won', color: 'hsl(126 58% 39%)', order: 5 },
  { id: 'lost', name: 'Lost', color: 'hsl(var(--destructive-foreground))', order: 6 },
];
