import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  Calendar,
  CalendarClock,
  ChevronLeft,
  FileText,
  FolderOpen,
  Link as LinkIcon,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { format, isValid, parseISO, startOfDay } from 'date-fns';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useCRMContext } from '@/contexts/CRMContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Contact, Project, ProjectLocation, ProjectStatus, ProjectVisit, VisitStatus, Creator } from '@/types/crm';
import { cn } from '@/lib/utils';

const PROJECT_STATUSES: ProjectStatus[] = [
  'Preparing',
  'Active',
  'Delivering',
  'Closed',
  'Archived',
];

const VISIT_STATUSES: VisitStatus[] = [
  'Sourcing',
  'Arranging',
  'Scheduled',
  'Posting',
  'Post-Eval',
  'Done',
];

const statusStyles: Record<ProjectStatus, string> = {
  Preparing: 'bg-muted/60 text-muted-foreground',
  Active: 'bg-primary/10 text-primary',
  Delivering: 'bg-accent/20 text-accent-foreground',
  Closed: 'bg-emerald-500/10 text-emerald-700',
  Archived: 'bg-muted text-muted-foreground',
};

const visitStatusStyles: Record<VisitStatus, string> = {
  Sourcing: 'bg-muted/60 text-muted-foreground',
  Arranging: 'bg-amber-500/10 text-amber-700',
  Scheduled: 'bg-primary/10 text-primary',
  Posting: 'bg-accent/20 text-accent-foreground',
  'Post-Eval': 'bg-sky-500/10 text-sky-700',
  Done: 'bg-emerald-500/10 text-emerald-700',
};

const PILOT_CHECKLIST_TITLE = 'Pilot call checklist';
const PILOT_CHECKLIST_TEMPLATE = `${PILOT_CHECKLIST_TITLE}
- Venue + POC + phone:
- Free experience (included/excluded):
- +1 included?:
- Creator slots:
- Date windows / blackout:
- Target audience:
- Posting requirement (platform + min posts):
- Posting deadline:
- On-site contact + check-in:
- Filming restrictions / no-go:
`;

const getClientLabel = (contact?: Contact) => {
  if (!contact) return 'Unknown client';
  if (contact.company?.trim()) return contact.company;
  return 'Company name missing';
};

const getClientSubLabel = (contact?: Contact) => {
  if (!contact) return '';
  if (contact.company?.trim()) return contact.fullName;
  return contact.fullName ? `POC: ${contact.fullName}` : '';
};

const getVisitDateTime = (visit: ProjectVisit) => {
  if (!visit.date) return null;
  const dateString = visit.time ? `${visit.date}T${visit.time}` : `${visit.date}T00:00`;
  const parsed = parseISO(dateString);
  return isValid(parsed) ? parsed : null;
};

const normalizeTikTokHandle = (handle?: string | null) => {
  if (!handle) return '';
  return handle.trim().replace(/^@/, '');
};

const getTikTokUrl = (handle?: string | null) => {
  const normalized = normalizeTikTokHandle(handle);
  return normalized ? `https://tiktok.com/@${normalized}` : '';
};

const getMapsUrl = (location?: string | null) => {
  const trimmed = location?.trim();
  return trimmed ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}` : '';
};

const stopCardClick = (event: React.MouseEvent) => event.stopPropagation();

const getVisitCreators = (visit: ProjectVisit, creatorsMap: Map<string, Creator>) =>
  (visit.creatorIds || [])
    .map((creatorId) => creatorsMap.get(creatorId))
    .filter((creator): creator is Creator => !!creator);

const formatCreatorNames = (creators: Creator[]) =>
  creators.map((creator) => creator.name).join(', ');

const getVisitLocationDisplay = (
  visit: ProjectVisit,
  locationsMap: Map<string, ProjectLocation>
) => {
  if (visit.locationId) {
    const location = locationsMap.get(visit.locationId);
    if (location) {
      return { label: location.label, address: location.address };
    }
  }
  const fallback = visit.location?.trim();
  return fallback ? { label: fallback, address: fallback } : { label: 'Location TBD', address: '' };
};

const visitNeedsAttention = (visit: ProjectVisit) =>
  (!visit.location?.trim() && !visit.locationId) || !visit.date || !visit.creatorIds?.length;

type ProjectCardMeta = {
  project: Project;
  visits: ProjectVisit[];
  nextVisit: ProjectVisit | null;
  lastVisit: ProjectVisit | null;
  creatorCount: number;
  needsAttentionCount: number;
};

const buildProjectMeta = (project: Project, visits: ProjectVisit[]): ProjectCardMeta => {
  const datedVisits = visits
    .map((visit) => ({ visit, date: getVisitDateTime(visit) }))
    .filter((entry): entry is { visit: ProjectVisit; date: Date } => !!entry.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const today = startOfDay(new Date());
  const nextVisitEntry = datedVisits.find((entry) => entry.date >= today) || null;
  const lastVisitEntry = datedVisits.length > 0 ? datedVisits[datedVisits.length - 1] : null;

  const creatorCount = new Set(
    visits.flatMap((visit) => visit.creatorIds || []).filter(Boolean)
  ).size;
  const needsAttentionCount = visits.filter(visitNeedsAttention).length;

  return {
    project,
    visits,
    nextVisit: nextVisitEntry?.visit ?? null,
    lastVisit: lastVisitEntry?.visit ?? null,
    creatorCount,
    needsAttentionCount,
  };
};

const sortProjects = (a: ProjectCardMeta, b: ProjectCardMeta) => {
  const aArchived = a.project.status === 'Archived';
  const bArchived = b.project.status === 'Archived';
  if (aArchived !== bArchived) return aArchived ? 1 : -1;

  const aCandidate = a.nextVisit || a.lastVisit;
  const bCandidate = b.nextVisit || b.lastVisit;
  const aDate = aCandidate ? getVisitDateTime(aCandidate) : null;
  const bDate = bCandidate ? getVisitDateTime(bCandidate) : null;

  const aTime = aDate ? aDate.getTime() : Number.POSITIVE_INFINITY;
  const bTime = bDate ? bDate.getTime() : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;

  return new Date(b.project.updatedAt).getTime() - new Date(a.project.updatedAt).getTime();
};

type VisitFormState = {
  location: string;
  locationId: string | null;
  date: string;
  time: string;
  creatorIds: string[];
  briefing: string;
  status: VisitStatus;
};

type VisitDialogFocus = 'location' | 'date' | 'creator' | 'briefing' | null;

const emptyVisitForm: VisitFormState = {
  location: '',
  locationId: null,
  date: '',
  time: '',
  creatorIds: [],
  briefing: '',
  status: 'Sourcing',
};

type DraggableVisitCardProps = {
  visit: ProjectVisit;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
};

const DraggableVisitCard = ({ visit, className, children, onClick }: DraggableVisitCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: visit.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const handleClick = () => {
    if (isDragging) return;
    onClick?.();
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(className, isDragging && 'opacity-80 shadow-lg')}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      {children}
    </Card>
  );
};

type KanbanColumnProps = {
  status: VisitStatus;
  visits: ProjectVisit[];
  creatorsMap: Map<string, Creator>;
  locationsMap: Map<string, ProjectLocation>;
  onEditVisit: (visit: ProjectVisit, focus?: Exclude<VisitDialogFocus, null>) => void;
  onDeleteVisit: (visit: ProjectVisit) => void;
  onMoveVisit: (visitId: string, status: VisitStatus) => void;
};

const KanbanColumn = ({
  status,
  visits,
  creatorsMap,
  locationsMap,
  onEditVisit,
  onDeleteVisit,
  onMoveVisit,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-w-[260px] w-72 flex-shrink-0 space-y-3',
        isOver && 'rounded-lg bg-muted/30 p-2',
      )}
    >
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={visitStatusStyles[status]}>
          {status}
        </Badge>
        <span className="text-xs text-muted-foreground">{visits.length}</span>
      </div>
      {visits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No visits
          </CardContent>
        </Card>
      ) : (
        visits.map((visit) => {
          const visitDate = getVisitDateTime(visit);
          const creators = getVisitCreators(visit, creatorsMap);
          const locationDisplay = getVisitLocationDisplay(visit, locationsMap);
          const needsAttention = visitNeedsAttention(visit);
          const currentStatus = visit.status || 'Sourcing';

          return (
            <DraggableVisitCard
              key={visit.id}
              visit={visit}
              className={cn('cursor-pointer', needsAttention && 'border-destructive/40')}
              onClick={() => onEditVisit(visit)}
            >
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {locationDisplay.address ? (
                        <span className="-m-1 inline-flex rounded-md p-1" onClick={stopCardClick}>
                          <a
                            href={getMapsUrl(locationDisplay.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary hover:underline"
                          >
                            {locationDisplay.label}
                          </a>
                        </span>
                      ) : (
                        <span>Location TBD</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {visitDate ? format(visitDate, 'MMM d, yyyy') : 'Date TBD'}
                      {visit.time && <span>| {visit.time}</span>}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={stopCardClick}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditVisit(visit)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit visit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {VISIT_STATUSES.filter((next) => next !== currentStatus).map((next) => (
                        <DropdownMenuItem
                          key={next}
                          onClick={() => onMoveVisit(visit.id, next)}
                        >
                          Move to {next}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDeleteVisit(visit)}
                        className="text-destructive-foreground"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete visit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {creators.length > 0 ? (
                    <span className="text-foreground">{formatCreatorNames(creators)}</span>
                  ) : (
                    <span>No creators assigned</span>
                  )}
                  {creators.length === 1 && creators[0].tiktokHandle && (
                    <span className="-m-1 inline-flex rounded-md p-1" onClick={stopCardClick}>
                      <a
                        href={getTikTokUrl(creators[0].tiktokHandle)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs"
                      >
                        @{normalizeTikTokHandle(creators[0].tiktokHandle)}
                      </a>
                    </span>
                  )}
                </div>

                {visit.briefing?.trim() && (
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {visit.briefing}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(event) => {
                      stopCardClick(event);
                      onEditVisit(visit, 'creator');
                    }}
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    Assign
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(event) => {
                      stopCardClick(event);
                      onEditVisit(visit, 'date');
                    }}
                  >
                    <CalendarClock className="mr-1 h-3.5 w-3.5" />
                    Date
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(event) => {
                      stopCardClick(event);
                      onEditVisit(visit, 'briefing');
                    }}
                  >
                    <FileText className="mr-1 h-3.5 w-3.5" />
                    Brief
                  </Button>
                </div>

                {needsAttention && (
                  <Badge variant="destructive">Needs attention</Badge>
                )}
              </CardContent>
            </DraggableVisitCard>
          );
        })
      )}
    </div>
  );
};

export default function Projects() {
  const {
    contacts,
    projects,
    projectVisits,
    creators,
    addProject,
    updateProject,
    addProjectVisit,
    updateProjectVisit,
    deleteProjectVisit,
    meContactId,
    addCreator,
    updateCreator,
    deleteCreator,
  } = useCRMContext();

  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectClientId, setNewProjectClientId] = useState('');
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [visitToEdit, setVisitToEdit] = useState<ProjectVisit | null>(null);
  const [visitToDelete, setVisitToDelete] = useState<ProjectVisit | null>(null);
  const [visitForm, setVisitForm] = useState<VisitFormState>(emptyVisitForm);
  const [projectNotes, setProjectNotes] = useState('');
  const [projectLinks, setProjectLinks] = useState('');
  const [viewMode, setViewMode] = useState<'overview' | 'kanban'>('overview');
  const [newCreatorName, setNewCreatorName] = useState('');
  const [newCreatorHandle, setNewCreatorHandle] = useState('');
  const [creatorDialogOpen, setCreatorDialogOpen] = useState(false);
  const [editingCreator, setEditingCreator] = useState<Creator | null>(null);
  const [creatorPanelName, setCreatorPanelName] = useState('');
  const [creatorPanelHandle, setCreatorPanelHandle] = useState('');
  const [visitDialogFocus, setVisitDialogFocus] = useState<VisitDialogFocus>(null);
  const [activeVisit, setActiveVisit] = useState<ProjectVisit | null>(null);
  const [newLocationLabel, setNewLocationLabel] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');

  const openProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('projectId', projectId);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const clearProjectSelection = useCallback(() => {
    setSelectedProjectId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('projectId');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  const contactMap = useMemo(() => new Map(contacts.map(contact => [contact.id, contact])), [contacts]);
  const creatorsMap = useMemo(() => new Map(creators.map(creator => [creator.id, creator])), [creators]);

  const visitsByProject = useMemo(() => {
    const map = new Map<string, ProjectVisit[]>();
    projectVisits.forEach((visit) => {
      if (!map.has(visit.projectId)) {
        map.set(visit.projectId, []);
      }
      map.get(visit.projectId)?.push(visit);
    });
    return map;
  }, [projectVisits]);

  const projectCards = useMemo(() => {
    return projects
      .filter(project => showArchived || project.status !== 'Archived')
      .map(project => buildProjectMeta(project, visitsByProject.get(project.id) || []))
      .sort(sortProjects);
  }, [projects, showArchived, visitsByProject]);

  const selectedProject = selectedProjectId
    ? projects.find(project => project.id === selectedProjectId) || null
    : null;

  const projectLocations = selectedProject?.locations ?? [];
  const projectLocationsMap = useMemo(
    () => new Map(projectLocations.map((location) => [location.id, location])),
    [projectLocations]
  );

  const selectedVisits = useMemo(() => {
    if (!selectedProject) return [];
    const visits = visitsByProject.get(selectedProject.id) || [];
    return [...visits].sort((a, b) => {
      const aDate = getVisitDateTime(a);
      const bDate = getVisitDateTime(b);
      if (aDate && bDate) return aDate.getTime() - bDate.getTime();
      if (aDate) return -1;
      if (bDate) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [selectedProject, visitsByProject]);

  const visitsByStatus = useMemo(() => {
    const map = new Map<VisitStatus, ProjectVisit[]>();
    VISIT_STATUSES.forEach((status) => map.set(status, []));
    selectedVisits.forEach((visit) => {
      const status = visit.status || 'Sourcing';
      map.get(status)?.push(visit);
    });
    return map;
  }, [selectedVisits]);

  const handleDragStart = (event: DragStartEvent) => {
    const visitId = event.active.id as string;
    const visit = selectedVisits.find((item) => item.id === visitId);
    if (visit) {
      setActiveVisit(visit);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveVisit(null);
    if (!over) return;
    const nextStatus = over.id as VisitStatus;
    if (!VISIT_STATUSES.includes(nextStatus)) return;
    const visitId = active.id as string;
    const visit = selectedVisits.find((item) => item.id === visitId);
    if (!visit || visit.status === nextStatus) return;
    updateProjectVisit(visitId, { status: nextStatus });
  };

  useEffect(() => {
    if (selectedProjectId && !projects.some(project => project.id === selectedProjectId)) {
      clearProjectSelection();
    }
  }, [clearProjectSelection, projects, selectedProjectId]);

  useEffect(() => {
    const projectId = searchParams.get('projectId');
    if (!projectId || projectId === selectedProjectId) return;
    if (projects.some(project => project.id === projectId)) {
      setSelectedProjectId(projectId);
    }
  }, [projects, searchParams, selectedProjectId]);

  useEffect(() => {
    if (!selectedProject) return;
    setProjectNotes(selectedProject.notes || '');
    setProjectLinks(selectedProject.links || '');
  }, [selectedProject?.id]);


  const clientOptions = useMemo(() => {
    return contacts
      .filter(contact => contact.id !== meContactId)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [contacts, meContactId]);

  const creatorOptions = useMemo(() => {
    return [...creators].sort((a, b) => a.name.localeCompare(b.name));
  }, [creators]);

  const sortedCreators = useMemo(() => {
    return [...creators].sort((a, b) => a.name.localeCompare(b.name));
  }, [creators]);

  const activeVisitLocation = activeVisit
    ? getVisitLocationDisplay(activeVisit, projectLocationsMap)
    : null;
  const selectedLocation =
    visitForm.locationId && projectLocationsMap.has(visitForm.locationId)
      ? projectLocationsMap.get(visitForm.locationId) || null
      : null;

  const handleCreateProject = () => {
    if (!newProjectClientId) return;
    const project = addProject({
      clientId: newProjectClientId,
      status: 'Preparing',
      notes: '',
      links: '',
      locations: [],
    });
    setNewProjectClientId('');
    setNewProjectOpen(false);
    if (project) {
      openProject(project.id);
    }
  };

  const handleAddLocation = () => {
    if (!selectedProject) return;
    const label = newLocationLabel.trim();
    const address = newLocationAddress.trim();
    if (!label || !address) return;
    const nextLocations = [
      ...projectLocations,
      { id: crypto.randomUUID(), label, address },
    ];
    updateProject(selectedProject.id, { locations: nextLocations });
    setNewLocationLabel('');
    setNewLocationAddress('');
  };

  const handleRemoveLocation = (locationId: string) => {
    if (!selectedProject) return;
    const nextLocations = projectLocations.filter((location) => location.id !== locationId);
    updateProject(selectedProject.id, { locations: nextLocations });
  };

  const openAddVisit = () => {
    setVisitToEdit(null);
    setVisitForm(emptyVisitForm);
    setNewCreatorName('');
    setNewCreatorHandle('');
    setVisitDialogFocus('location');
    setVisitDialogOpen(true);
  };

  const openEditVisit = (visit: ProjectVisit, focus?: Exclude<VisitDialogFocus, null>) => {
    setVisitToEdit(visit);
    setVisitForm({
      location: visit.location || '',
      locationId: visit.locationId ?? null,
      date: visit.date || '',
      time: visit.time || '',
      creatorIds: visit.creatorIds || [],
      briefing: visit.briefing || '',
      status: visit.status || 'Sourcing',
    });
    setNewCreatorName('');
    setNewCreatorHandle('');
    setVisitDialogFocus(focus || null);
    setVisitDialogOpen(true);
  };

  const handleSaveVisit = () => {
    if (!selectedProject) return;
    if (visitToEdit) {
      updateProjectVisit(visitToEdit.id, {
        location: visitForm.location.trim(),
        locationId: visitForm.locationId,
        date: visitForm.date,
        time: visitForm.time,
        creatorIds: visitForm.creatorIds,
        briefing: visitForm.briefing.trim(),
        status: visitForm.status,
      });
    } else {
      addProjectVisit({
        projectId: selectedProject.id,
        location: visitForm.location.trim(),
        locationId: visitForm.locationId,
        date: visitForm.date,
        time: visitForm.time,
        creatorIds: visitForm.creatorIds,
        briefing: visitForm.briefing.trim(),
        status: visitForm.status,
      });
    }
    setVisitDialogOpen(false);
    setVisitToEdit(null);
    setVisitForm(emptyVisitForm);
  };

  const handleDeleteVisit = () => {
    if (!visitToDelete) return;
    deleteProjectVisit(visitToDelete.id);
    setVisitToDelete(null);
  };

  const handleCreateCreator = () => {
    const name = newCreatorName.trim();
    if (!name) return;
    const newCreator = addCreator({
      name,
      tiktokHandle: normalizeTikTokHandle(newCreatorHandle),
      notes: '',
    });
    setVisitForm((prev) => ({
      ...prev,
      creatorIds: Array.from(new Set([...(prev.creatorIds || []), newCreator.id])),
    }));
    setNewCreatorName('');
    setNewCreatorHandle('');
  };

  const resetCreatorPanel = () => {
    setEditingCreator(null);
    setCreatorPanelName('');
    setCreatorPanelHandle('');
  };

  const handleSaveCreatorPanel = () => {
    const name = creatorPanelName.trim();
    if (!name) return;
    if (editingCreator) {
      updateCreator(editingCreator.id, {
        name,
        tiktokHandle: normalizeTikTokHandle(creatorPanelHandle),
      });
    } else {
      addCreator({
        name,
        tiktokHandle: normalizeTikTokHandle(creatorPanelHandle),
        notes: '',
      });
    }
    resetCreatorPanel();
  };

  const handleEditCreator = (creator: Creator) => {
    setEditingCreator(creator);
    setCreatorPanelName(creator.name);
    setCreatorPanelHandle(creator.tiktokHandle || '');
  };

  const handleArchiveProject = () => {
    if (!selectedProject) return;
    updateProject(selectedProject.id, { status: 'Archived' });
    setArchiveDialogOpen(false);
  };

  const handleRestoreProject = () => {
    if (!selectedProject) return;
    updateProject(selectedProject.id, { status: 'Preparing' });
  };

  const hasPilotChecklist = projectNotes.includes(PILOT_CHECKLIST_TITLE);
  const notesRows = Math.max(4, (projectNotes.match(/\n/g)?.length ?? 0) + 1);

  const handleInsertPilotChecklist = () => {
    if (!selectedProject || hasPilotChecklist) return;
    const trimmed = projectNotes.trim();
    const nextNotes = trimmed
      ? `${trimmed}\n\n${PILOT_CHECKLIST_TEMPLATE}`
      : PILOT_CHECKLIST_TEMPLATE;
    setProjectNotes(nextNotes);
    updateProject(selectedProject.id, { notes: nextNotes });
  };

  if (selectedProject) {
    const client = contactMap.get(selectedProject.clientId);
    const selectedMeta = buildProjectMeta(selectedProject, selectedVisits);
    const nextVisitDate = selectedMeta.nextVisit ? getVisitDateTime(selectedMeta.nextVisit) : null;
    const lastVisitDate = selectedMeta.lastVisit ? getVisitDateTime(selectedMeta.lastVisit) : null;

    return (
      <div className="p-6 lg:p-8 xl:p-10 max-w-6xl 2xl:max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={clearProjectSelection}
              className="h-9 w-9"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                {getClientLabel(client)}
              </h1>
              <p className="text-muted-foreground lg:text-lg mt-1">Project</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-border p-1">
              <Button
                size="sm"
                variant={viewMode === 'overview' ? 'secondary' : 'ghost'}
                onClick={() => setViewMode('overview')}
                className="h-8 rounded-full px-3"
              >
                Overview
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                onClick={() => setViewMode('kanban')}
                className="h-8 rounded-full px-3"
              >
                Kanban
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {selectedProject.status !== 'Archived' ? (
                  <DropdownMenuItem onClick={() => setArchiveDialogOpen(true)}>
                    <Archive className="h-4 w-4 mr-2" />
                    Archive project
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleRestoreProject}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Restore project
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {viewMode === 'overview' ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Project Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Client</p>
                  {client ? (
                    <Link
                      to={`/contacts/${client.id}`}
                      className="text-primary font-medium hover:underline inline-flex items-center gap-1"
                    >
                      {getClientLabel(client)}
                    </Link>
                  ) : (
                    <p className="text-muted-foreground">Unknown client</p>
                  )}
                  {client?.fullName && (
                    <Link
                      to={`/contacts/${client.id}`}
                      className="text-xs uppercase tracking-wide text-muted-foreground hover:text-primary hover:underline block"
                    >
                      POC: {client.fullName}
                    </Link>
                  )}
                </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={selectedProject.status}
                      onValueChange={(value) => updateProject(selectedProject.id, { status: value as ProjectStatus })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Set status" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_STATUSES.map(status => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Locations
                    </Label>
                    {projectLocations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No locations yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {projectLocations.map((location) => (
                          <div
                            key={location.id}
                            className="flex items-start justify-between gap-2 rounded-md border border-border/60 p-2"
                          >
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium text-foreground">{location.label}</p>
                              <a
                                href={getMapsUrl(location.address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline"
                              >
                                {location.address}
                              </a>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleRemoveLocation(location.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-2">
                      <Input
                        value={newLocationLabel}
                        onChange={(e) => setNewLocationLabel(e.target.value)}
                        placeholder="Location name (Berlin)"
                      />
                      <Input
                        value={newLocationAddress}
                        onChange={(e) => setNewLocationAddress(e.target.value)}
                        placeholder="Address"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddLocation}
                        disabled={!newLocationLabel.trim() || !newLocationAddress.trim()}
                      >
                        Add location
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Locations show up in the visit dropdown for this project.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                    <div>
                      <p className="text-xs uppercase tracking-wide">Visits</p>
                      <p className="text-base text-foreground font-semibold">{selectedVisits.length}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide">Creators</p>
                      <p className="text-base text-foreground font-semibold">{selectedMeta.creatorCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide">Needs attention</p>
                      <p className="text-base text-foreground font-semibold">{selectedMeta.needsAttentionCount}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs uppercase tracking-wide">Next visit</p>
                      <p className="text-base text-foreground font-semibold">
                        {nextVisitDate
                          ? format(nextVisitDate, 'MMM d, yyyy')
                          : lastVisitDate
                            ? `Last: ${format(lastVisitDate, 'MMM d, yyyy')}`
                            : 'No visits yet'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Notes & Links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      Links
                    </Label>
                    <Textarea
                      value={projectLinks}
                      onChange={(e) => setProjectLinks(e.target.value)}
                      onBlur={() => updateProject(selectedProject.id, { links: projectLinks })}
                      placeholder="Brief link, folder link, drive, etc."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Notes</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleInsertPilotChecklist}
                        disabled={hasPilotChecklist}
                      >
                        {hasPilotChecklist ? 'Pilot checklist added' : 'Insert pilot checklist'}
                      </Button>
                    </div>
                    <Textarea
                      value={projectNotes}
                      onChange={(e) => setProjectNotes(e.target.value)}
                      onBlur={() => updateProject(selectedProject.id, { notes: projectNotes })}
                      placeholder="Key context for this pilot."
                      rows={notesRows}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Visits</h2>
                  <p className="text-sm text-muted-foreground">All visits for this project.</p>
                </div>
                <Button variant="outline" onClick={openAddVisit}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Visit
                </Button>
              </div>

              {selectedVisits.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                    <MapPin className="h-10 w-10 text-muted-foreground mb-3" />
                    <h3 className="text-lg font-medium text-foreground">No visits yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mt-2">
                      Add the first visit with location, creator(s), and optional briefing. Date/time can be added later.
                    </p>
                    <Button className="mt-4" onClick={openAddVisit}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Visit
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {selectedVisits.map((visit) => {
                    const visitDate = getVisitDateTime(visit);
                    const creators = getVisitCreators(visit, creatorsMap);
                    const locationDisplay = getVisitLocationDisplay(visit, projectLocationsMap);
                    const needsAttention = visitNeedsAttention(visit);
                    return (
                      <Card
                        key={visit.id}
                        className="cursor-pointer"
                        onClick={() => openEditVisit(visit)}
                      >
                      <CardContent className="space-y-3 pt-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                {locationDisplay.address ? (
                                  <span className="-m-1 inline-flex rounded-md p-1" onClick={stopCardClick}>
                                    <a
                                      href={getMapsUrl(locationDisplay.address)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:text-primary hover:underline"
                                    >
                                      {locationDisplay.label}
                                    </a>
                                  </span>
                                ) : (
                                  <span>Location TBD</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                {visitDate ? format(visitDate, 'MMM d, yyyy') : 'Date TBD'}
                                {visit.time && <span>| {visit.time}</span>}
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={stopCardClick}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditVisit(visit)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit visit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setVisitToDelete(visit)}
                                  className="text-destructive-foreground"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete visit
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Users className="h-4 w-4" />
                            {creators.length > 0 ? (
                              <span className="text-foreground">{formatCreatorNames(creators)}</span>
                            ) : (
                              <span>No creators assigned</span>
                            )}
                            {creators.length === 1 && creators[0].tiktokHandle && (
                              <span className="-m-1 inline-flex rounded-md p-1" onClick={stopCardClick}>
                                <a
                                  href={getTikTokUrl(creators[0].tiktokHandle)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline text-xs"
                                >
                                  @{normalizeTikTokHandle(creators[0].tiktokHandle)}
                                </a>
                              </span>
                            )}
                          </div>

                          {visit.briefing?.trim() && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {visit.briefing}
                            </p>
                          )}

                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={visitStatusStyles[visit.status || 'Sourcing']}>
                              {visit.status || 'Sourcing'}
                            </Badge>
                            {needsAttention && (
                              <Badge variant="destructive">Needs attention</Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Visit Board</h2>
                <p className="text-sm text-muted-foreground">Each card represents one visit (one or more creators).</p>
              </div>
              <Button variant="outline" onClick={openAddVisit}>
                <Plus className="h-4 w-4 mr-2" />
                Add Visit
              </Button>
            </div>

            {selectedVisits.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                  <MapPin className="h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium text-foreground">No visits yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mt-2">
                    Add the first visit with location, creator(s), and optional briefing. Date/time can be added later.
                  </p>
                  <Button className="mt-4" onClick={openAddVisit}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Visit
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {VISIT_STATUSES.map((status) => (
                    <KanbanColumn
                      key={status}
                      status={status}
                      visits={visitsByStatus.get(status) || []}
                      creatorsMap={creatorsMap}
                      locationsMap={projectLocationsMap}
                      onEditVisit={openEditVisit}
                      onDeleteVisit={(visit) => setVisitToDelete(visit)}
                      onMoveVisit={(visitId, nextStatus) => updateProjectVisit(visitId, { status: nextStatus })}
                    />
                  ))}
                </div>
                <DragOverlay>
                  {activeVisit ? (
                    <Card className="w-72">
                      <CardContent className="space-y-3 pt-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {activeVisitLocation?.address ? (
                            <span className="-m-1 inline-flex rounded-md p-1" onClick={stopCardClick}>
                              <a
                                href={getMapsUrl(activeVisitLocation.address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary hover:underline"
                              >
                                {activeVisitLocation.label}
                              </a>
                            </span>
                          ) : (
                            <span>Location TBD</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {getVisitDateTime(activeVisit)
                            ? format(getVisitDateTime(activeVisit) as Date, 'MMM d, yyyy')
                            : 'Date TBD'}
                          {activeVisit.time && <span>| {activeVisit.time}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Users className="h-4 w-4" />
                          {getVisitCreators(activeVisit, creatorsMap).length > 0 ? (
                            <span className="text-foreground">
                              {formatCreatorNames(getVisitCreators(activeVisit, creatorsMap))}
                            </span>
                          ) : (
                            <span>No creators assigned</span>
                          )}
                        </div>
                        {activeVisit.briefing?.trim() && (
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {activeVisit.briefing}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        )}

        <Dialog
          open={visitDialogOpen}
          onOpenChange={(open) => {
            setVisitDialogOpen(open);
            if (!open) {
              setVisitDialogFocus(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{visitToEdit ? 'Edit Visit' : 'Add Visit'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Location</Label>
                {projectLocations.length > 0 && (
                  <Select
                    value={
                      visitForm.locationId && projectLocationsMap.has(visitForm.locationId)
                        ? visitForm.locationId
                        : 'custom'
                    }
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        setVisitForm((prev) => ({ ...prev, locationId: null }));
                        return;
                      }
                      const location = projectLocations.find((entry) => entry.id === value);
                      setVisitForm((prev) => ({
                        ...prev,
                        locationId: value,
                        location: location?.address || '',
                      }));
                    }}
                  >
                    <SelectTrigger autoFocus={visitDialogFocus === 'location'} className="text-left">
                      <SelectValue className="text-left" placeholder="Select a project location" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectLocations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          <div className="flex flex-col">
                            <span>{location.label}</span>
                            <span className="text-xs text-muted-foreground">{location.address}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom location…</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {(!projectLocations.length || !visitForm.locationId) && (
                  <Input
                    value={visitForm.location}
                    onChange={(e) => setVisitForm({ ...visitForm, location: e.target.value })}
                    placeholder="City, venue, or address"
                    autoFocus={visitDialogFocus === 'location'}
                  />
                )}
                {selectedLocation && (
                  <p className="text-xs text-muted-foreground">
                    Address: {selectedLocation.address}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={visitForm.date}
                  onChange={(e) => setVisitForm({ ...visitForm, date: e.target.value })}
                  autoFocus={visitDialogFocus === 'date'}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={visitForm.time}
                  onChange={(e) => setVisitForm({ ...visitForm, time: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Date and time are optional — you can add them once confirmed.
            </p>
              <div className="space-y-2">
                <Label>Creators</Label>
                {creatorOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No creators yet. Add one below.</p>
                ) : (
                  <div className="rounded-lg border border-border p-3 space-y-2 max-h-40 overflow-y-auto">
                    {creatorOptions.map((creator, index) => {
                      const checked = visitForm.creatorIds.includes(creator.id);
                      return (
                        <label
                          key={creator.id}
                          className="flex items-center gap-2 text-sm text-foreground"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setVisitForm((prev) => {
                                const next = new Set(prev.creatorIds || []);
                                if (value) {
                                  next.add(creator.id);
                                } else {
                                  next.delete(creator.id);
                                }
                                return { ...prev, creatorIds: Array.from(next) };
                              });
                            }}
                            autoFocus={visitDialogFocus === 'creator' && index === 0}
                          />
                          <span>{creator.name}</span>
                          {creator.tiktokHandle && (
                            <span className="text-xs text-muted-foreground">
                              @{normalizeTikTokHandle(creator.tiktokHandle)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={newCreatorName}
                    onChange={(e) => setNewCreatorName(e.target.value)}
                    placeholder="Add creator name"
                  />
                  <Input
                    value={newCreatorHandle}
                    onChange={(e) => setNewCreatorHandle(e.target.value)}
                    placeholder="@tiktok"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateCreator}
                    disabled={!newCreatorName.trim()}
                    className="sm:w-auto"
                  >
                    Add Creator
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add a creator and their TikTok handle (optional). This creates a new creator and assigns them to this visit.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={visitForm.status}
                  onValueChange={(value) => setVisitForm({ ...visitForm, status: value as VisitStatus })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Briefing (optional)</Label>
                <Textarea
                  value={visitForm.briefing}
                  onChange={(e) => setVisitForm({ ...visitForm, briefing: e.target.value })}
                  placeholder="What should the creator capture?"
                  rows={4}
                  autoFocus={visitDialogFocus === 'briefing'}
                />
                <p className="text-xs text-muted-foreground">
                  Add when you have a clear brief.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVisitDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveVisit}
                disabled={
                  (!(visitForm.locationId || visitForm.location.trim())) ||
                  visitForm.creatorIds.length === 0
                }
              >
                {visitToEdit ? 'Save Visit' : 'Add Visit'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this project?</AlertDialogTitle>
              <AlertDialogDescription>
                Archived projects are hidden from the main list, but you can restore them anytime.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleArchiveProject}>Archive</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!visitToDelete} onOpenChange={(open) => !open && setVisitToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this visit?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the visit from this project.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteVisit}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-5xl lg:max-w-6xl 2xl:max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="sr-only sm:not-sr-only text-3xl lg:text-4xl font-bold text-foreground">Projects</h1>
            <p className="text-muted-foreground lg:text-lg mt-1">
              Pilot projects automatically start when a client reaches \"Pilot agreed\".
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="show-archived"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label htmlFor="show-archived" className="text-sm text-muted-foreground">
                Show archived
              </Label>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                resetCreatorPanel();
                setCreatorDialogOpen(true);
              }}
            >
              Creators
            </Button>
            <Button onClick={() => setNewProjectOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </div>
      </div>

      {projectCards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No projects yet</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-sm">
              Projects appear when a contact moves into the \"Pilot agreed\" stage. You can also create one manually.
            </p>
            <Button onClick={() => setNewProjectOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectCards.map(({ project, visits, nextVisit, lastVisit, creatorCount, needsAttentionCount }) => {
            const client = contactMap.get(project.clientId);
            const label = getClientLabel(client);
            const subLabel = getClientSubLabel(client);
            const nextDate = nextVisit ? getVisitDateTime(nextVisit) : null;
            const lastDate = lastVisit ? getVisitDateTime(lastVisit) : null;

            return (
              <Card
                key={project.id}
                className="cursor-pointer transition-colors hover:bg-muted/50 hover:border-muted-foreground/20"
                onClick={() => openProject(project.id)}
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base font-medium">{label}</CardTitle>
                    {subLabel && <p className="text-xs text-muted-foreground mt-1">{subLabel}</p>}
                  </div>
                  <Badge variant="outline" className={statusStyles[project.status]}>{project.status}</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {nextDate
                      ? `Next visit: ${format(nextDate, 'MMM d, yyyy')}`
                      : lastDate
                        ? `Last visit: ${format(lastDate, 'MMM d, yyyy')}`
                        : 'No visits scheduled'}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{visits.length} visits</span>
                    <span>{creatorCount} creators</span>
                    {needsAttentionCount > 0 && (
                      <span className="text-destructive-foreground">{needsAttentionCount} needs attention</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={newProjectClientId} onValueChange={setNewProjectClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  {clientOptions.map(contact => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.fullName}{contact.company ? ` | ${contact.company}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProjectOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={!newProjectClientId}>
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={creatorDialogOpen}
        onOpenChange={(open) => {
          setCreatorDialogOpen(open);
          if (!open) resetCreatorPanel();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Creators</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={creatorPanelName}
                  onChange={(e) => setCreatorPanelName(e.target.value)}
                  placeholder="Creator name"
                />
              </div>
              <div className="space-y-2">
                <Label>TikTok Handle</Label>
                <Input
                  value={creatorPanelHandle}
                  onChange={(e) => setCreatorPanelHandle(e.target.value)}
                  placeholder="@tiktok"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              {editingCreator && (
                <Button variant="outline" onClick={resetCreatorPanel}>
                  Cancel
                </Button>
              )}
              <Button onClick={handleSaveCreatorPanel} disabled={!creatorPanelName.trim()}>
                {editingCreator ? 'Save Creator' : 'Add Creator'}
              </Button>
            </div>
            <div className="space-y-2">
              {sortedCreators.length === 0 ? (
                <p className="text-sm text-muted-foreground">No creators yet.</p>
              ) : (
                sortedCreators.map((creator) => (
                  <div
                    key={creator.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{creator.name}</p>
                      {creator.tiktokHandle && (
                        <a
                          href={getTikTokUrl(creator.tiktokHandle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          @{normalizeTikTokHandle(creator.tiktokHandle)}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditCreator(creator)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive-foreground"
                        onClick={() => deleteCreator(creator.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
