export interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
}

export type Lifecycle =
  | 'sourced'
  | 'qualified'
  | 'contacting'
  | 'talking'
  | 'meeting'
  | 'proposal'
  | 'pilot'
  | 'customer'
  | 'not_now'
  | 'lost'
  | 'disqualified';

/** The funnel in order; `exit` stages sit outside the main flow. */
export const LIFECYCLES: { id: Lifecycle; label: string; exit?: boolean }[] = [
  { id: 'sourced', label: 'Sourced' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'contacting', label: 'Contacting' },
  { id: 'talking', label: 'Talking' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'pilot', label: 'Pilot' },
  { id: 'customer', label: 'Customer' },
  { id: 'not_now', label: 'Not now', exit: true },
  { id: 'lost', label: 'Lost', exit: true },
  { id: 'disqualified', label: 'Disqualified', exit: true },
];

export const lifecycleLabel = (lifecycle: Lifecycle) =>
  LIFECYCLES.find((entry) => entry.id === lifecycle)?.label ?? lifecycle;

/** Deals in progress: someone is talking to them and it's not over. */
export const OPEN_DEAL_LIFECYCLES: Lifecycle[] = ['talking', 'meeting', 'proposal', 'pilot'];

export type CompanyType = 'venue' | 'brand' | 'chain' | 'partner' | 'other';

export const COMPANY_TYPES: { id: CompanyType; label: string }[] = [
  { id: 'venue', label: 'Venue' },
  { id: 'brand', label: 'Brand' },
  { id: 'chain', label: 'Chain' },
  { id: 'partner', label: 'Partner' },
  { id: 'other', label: 'Unspecified' },
];

export type FitGrade = 'A' | 'B' | 'C';

export interface Company {
  id: string;
  name: string;
  type: CompanyType;
  industry: string;
  city: string;
  address: string;
  website: string;
  phone: string;
  email: string;
  instagram: string;
  googleMapsUrl: string;
  lifecycle: Lifecycle;
  lifecycleChangedAt: string;
  fit: FitGrade | null;
  fitScore: number | null;
  fitReason: string;
  lists: string[];
  source: string;
  notes: string;
  lostReason: string;
  revisitOn: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  cadenceStep: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  /** Person the task is about, if any. */
  contactId?: string | null;
  /** Company the task is about; neither set means a personal task. */
  companyId?: string | null;
  title: string;
  description?: string;
  dueDate: string;
  dueTime?: string;
  hasReminder: boolean;
  completed: boolean;
  createdAt: string;
}

export interface EisenhowerItem {
  id: string;
  title: string;
  importance: boolean;
  urgency: boolean;
  completed: boolean;
  linkedTaskId?: string | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  companyId?: string | null;
  fullName: string;
  role?: string;
  company: string;
  website?: string;
  email: string;
  phone: string;
  stageId: string;
  notes: string;
  notesLastEdited?: string;
  lastInteractionDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Creator {
  id: string;
  name: string;
  tiktokHandle?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType = 'call' | 'call_attempted' | 'email' | 'meeting' | 'note' | 'stage_change' | 'task_completed';

export interface Activity {
  id: string;
  contactId?: string | null;
  companyId?: string | null;
  type: ActivityType;
  description: string;
  timestamp: string;
}

// Research Lists feature
export type ResearchStatus = 'researching' | 'ready' | 'promoted';
export type ResearchPriority = 'low' | 'medium' | 'high';

export interface ResearchList {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchEntry {
  id: string;
  listId: string;
  company: string;
  poc: string; // Point of Contact
  email: string;
  website: string;
  industry: string;
  notes: string;
  priority: ResearchPriority;
  status: ResearchStatus;
  linkedContactId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Projects
export type ProjectStatus = 'Preparing' | 'Active' | 'Delivering' | 'Closed' | 'Archived';

export type VisitStatus = 'Sourcing' | 'Arranging' | 'Scheduled' | 'Posting' | 'Post-Eval' | 'Done';

export interface Project {
  id: string;
  clientId: string;
  status: ProjectStatus;
  notes: string;
  links: string;
  locations: ProjectLocation[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLocation {
  id: string;
  label: string;
  address: string;
}

export interface ProjectVisit {
  id: string;
  projectId: string;
  location: string;
  locationId?: string | null;
  date: string;
  time?: string;
  creatorIds: string[];
  status: VisitStatus;
  briefing: string;
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
