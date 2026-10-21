import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Edit2,
  Globe,
  Instagram,
  Mail,
  MapPin,
  Phone,
  PhoneMissed,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { instagramUrl } from '@/lib/utils';
import { AddActivityDialog } from '@/components/AddActivityDialog';
import { AddTaskDialog } from '@/components/AddTaskDialog';
import { CompanyEmails } from '@/components/CompanyEmails';
import { CompanySequenceCard } from '@/components/CompanySequenceCard';
import { CompanyResearchCard } from '@/components/CompanyResearchCard';
import { TaskItem } from '@/components/TaskItem';
import { TaskDetailDialog } from '@/components/TaskDetailDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  COMPANY_TYPES,
  LIFECYCLES,
  type ActivityType,
  type Company,
  type CompanyType,
  type Contact,
  type FitGrade,
  type Lifecycle,
  type Task,
} from '@/types/crm';

const activityIcons: Record<ActivityType, React.ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  call_attempted: <PhoneMissed className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  meeting: <Building2 className="h-4 w-4" />,
  note: <Edit2 className="h-4 w-4" />,
  stage_change: <ArrowRight className="h-4 w-4" />,
  task_completed: <CheckCircle2 className="h-4 w-4" />,
};

const NOTES_SAVE_DELAY_MS = 800;
const TIMELINE_PAGE = 15;

const withProtocol = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

type CompanyFields = Pick<
  Company,
  'name' | 'type' | 'industry' | 'city' | 'address' | 'website' | 'phone' | 'email' | 'instagram' | 'googleMapsUrl'
>;

function EditCompanyDialog({
  company,
  open,
  onOpenChange,
  onSave,
}: {
  company: Company;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (fields: CompanyFields) => void;
}) {
  const [fields, setFields] = useState<CompanyFields>(company);
  useEffect(() => {
    if (open) setFields(company);
  }, [open, company]);
  const field = (key: keyof CompanyFields, label: string, placeholder = '') => (
    <div className="grid gap-1.5">
      <Label htmlFor={`company-${key}`}>{label}</Label>
      <Input
        id={`company-${key}`}
        value={fields[key] as string}
        placeholder={placeholder}
        onChange={(event) => setFields({ ...fields, [key]: event.target.value })}
      />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit company</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {field('name', 'Name')}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={fields.type} onValueChange={(value) => setFields({ ...fields, type: value as CompanyType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {field('industry', 'Industry', 'e.g. Paint & Sip')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('city', 'City')}
            {field('phone', 'Phone')}
          </div>
          {field('address', 'Address')}
          <div className="grid grid-cols-2 gap-3">
            {field('website', 'Website', 'https://')}
            {field('email', 'General email', 'info@…')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('instagram', 'Instagram', '@handle')}
            {field('googleMapsUrl', 'Google Maps link')}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!fields.name.trim()}
            onClick={() => {
              onSave({ ...fields, name: fields.name.trim() });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PersonFields = Pick<Contact, 'fullName' | 'role' | 'email' | 'phone' | 'notes'>;
const EMPTY_PERSON: PersonFields = { fullName: '', role: '', email: '', phone: '', notes: '' };

function PersonDialog({
  person,
  open,
  onOpenChange,
  onSave,
}: {
  person: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (fields: PersonFields) => void;
}) {
  const [fields, setFields] = useState<PersonFields>(EMPTY_PERSON);
  useEffect(() => {
    if (open) {
      setFields(
        person
          ? { fullName: person.fullName, role: person.role ?? '', email: person.email, phone: person.phone, notes: person.notes ?? '' }
          : EMPTY_PERSON,
      );
    }
  }, [open, person]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{person ? 'Edit person' : 'Add person'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
            autoFocus
            placeholder="Name"
            value={fields.fullName}
            onChange={(event) => setFields({ ...fields, fullName: event.target.value })}
          />
          <Input
            placeholder="Role (e.g. Marketing, Owner)"
            value={fields.role}
            onChange={(event) => setFields({ ...fields, role: event.target.value })}
          />
          <Input
            type="email"
            placeholder="Email"
            value={fields.email}
            onChange={(event) => setFields({ ...fields, email: event.target.value })}
          />
          <Input
            placeholder="Phone"
            value={fields.phone}
            onChange={(event) => setFields({ ...fields, phone: event.target.value })}
          />
          <Textarea
            placeholder="Notes about this person"
            rows={4}
            value={fields.notes}
            onChange={(event) => setFields({ ...fields, notes: event.target.value })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!fields.fullName.trim()}
            onClick={() => {
              onSave({ ...fields, fullName: fields.fullName.trim() });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    companies,
    getCompanyById,
    getCompanyPeople,
    getCompanyTasks,
    getCompanyActivities,
    updateCompany,
    deleteCompany,
    addPerson,
    updateContact,
    deleteContact,
    deleteActivity,
    toggleTaskComplete,
    deleteTask,
    rescheduleTask,
  } = useCRMContext();

  const company = getCompanyById(id);
  const people = company ? getCompanyPeople(company.id) : [];
  const tasks = company ? getCompanyTasks(company.id) : [];
  const activities = company ? getCompanyActivities(company.id) : [];

  const [editOpen, setEditOpen] = useState(false);
  const [personDialog, setPersonDialog] = useState<{ open: boolean; person: Contact | null }>({ open: false, person: null });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [timelineLimit, setTimelineLimit] = useState(TIMELINE_PAGE);
  const [notes, setNotes] = useState('');
  const [newList, setNewList] = useState('');
  const notesTimer = useRef<number | null>(null);

  useEffect(() => {
    setNotes(company?.notes ?? '');
    // Only reset when switching companies, not on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  if (!company) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center space-y-4">
        <p className="text-muted-foreground">This company doesn't exist (anymore).</p>
        <Button variant="outline" onClick={() => navigate('/companies')}>
          Back to companies
        </Button>
      </div>
    );
  }

  const personName = (contactId?: string | null) => people.find((person) => person.id === contactId)?.fullName;
  const openTasks = tasks.filter((task) => !task.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const completedTasks = tasks.filter((task) => task.completed);
  const allLists = [...new Set(companies.flatMap((item) => item.lists))].filter((list) => !company.lists.includes(list));

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(() => updateCompany(company.id, { notes: value }), NOTES_SAVE_DELAY_MS);
  };

  const addList = (list: string) => {
    const name = list.trim();
    if (!name || company.lists.includes(name)) return;
    updateCompany(company.id, { lists: [...company.lists, name] });
    setNewList('');
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete ${company.name} with its tasks and history? People stay, unlinked.`)) return;
    deleteCompany(company.id);
    navigate('/companies');
  };

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-6xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: who they are */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-xl break-words">{company.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {[COMPANY_TYPES.find((type) => type.id === company.type)?.label, company.industry, company.city]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0">
                  <Button variant="ghost" size="icon" aria-label="Edit company" onClick={() => setEditOpen(true)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete company"
                    className="text-muted-foreground hover:text-destructive-foreground"
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Stage</Label>
                  <Select
                    value={company.lifecycle}
                    onValueChange={(value) => updateCompany(company.id, { lifecycle: value as Lifecycle })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIFECYCLES.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Fit</Label>
                  <Select
                    value={company.fit ?? 'none'}
                    onValueChange={(value) =>
                      updateCompany(company.id, { fit: value === 'none' ? null : (value as FitGrade) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A · great fit</SelectItem>
                      <SelectItem value="B">B · good fit</SelectItem>
                      <SelectItem value="C">C · weak fit</SelectItem>
                      <SelectItem value="none">Not rated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                In this stage since {format(new Date(company.lifecycleChangedAt), 'd MMM yyyy')}
              </p>

              {company.lifecycle === 'lost' && (
                <Input
                  placeholder="Why was it lost?"
                  defaultValue={company.lostReason}
                  onBlur={(event) => updateCompany(company.id, { lostReason: event.target.value.trim() })}
                />
              )}
              {company.lifecycle === 'not_now' && (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Revisit on</Label>
                  <Input
                    type="date"
                    value={company.revisitOn ?? ''}
                    onChange={(event) => updateCompany(company.id, { revisitOn: event.target.value || null })}
                  />
                </div>
              )}

              <div className="space-y-2 text-sm">
                {company.phone && (
                  <a href={`tel:${company.phone}`} className="flex items-center gap-2 hover:text-primary">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {company.phone}
                  </a>
                )}
                {company.email && (
                  <a href={`mailto:${company.email}`} className="flex items-center gap-2 hover:text-primary">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {company.email}
                  </a>
                )}
                {company.website && (
                  <a
                    href={withProtocol(company.website)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 hover:text-primary truncate"
                  >
                    <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{company.website.replace(/^https?:\/\//, '')}</span>
                  </a>
                )}
                {company.instagram && (
                  <a
                    href={instagramUrl(company.instagram)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 hover:text-primary"
                  >
                    <Instagram className="h-4 w-4 text-muted-foreground" />
                    {company.instagram}
                  </a>
                )}
                {(company.address || company.googleMapsUrl) && (
                  <a
                    href={company.googleMapsUrl || `https://maps.google.com/?q=${encodeURIComponent(company.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 hover:text-primary"
                  >
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{company.address || 'Google Maps'}</span>
                  </a>
                )}
              </div>

              {company.nextActionAt && (
                <div className="rounded-md bg-muted/50 p-3 text-sm flex items-center justify-between gap-2">
                  <span>
                    Next: {company.nextAction ?? 'Call'} ·{' '}
                    {formatDistanceToNow(new Date(company.nextActionAt), { addSuffix: true })}
                  </span>
                  <Link to={`/calls?company=${company.id}`} className="text-primary text-xs hover:underline">
                    Call mode
                  </Link>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Lists</Label>
                <div className="flex flex-wrap gap-1.5">
                  {company.lists.map((list) => (
                    <span
                      key={list}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                    >
                      <Link to={`/companies?list=${encodeURIComponent(list)}&stage=all`} className="hover:underline">
                        {list}
                      </Link>
                      <button
                        aria-label={`Remove from ${list}`}
                        onClick={() => updateCompany(company.id, { lists: company.lists.filter((item) => item !== list) })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    list="known-lists"
                    placeholder="Add to list…"
                    value={newList}
                    className="h-8 text-sm"
                    onChange={(event) => setNewList(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') addList(newList);
                    }}
                  />
                  <datalist id="known-lists">
                    {allLists.map((list) => (
                      <option key={list} value={list} />
                    ))}
                  </datalist>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => addList(newList)} disabled={!newList.trim()}>
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">People</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setPersonDialog({ open: true, person: null })}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {people.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No one yet. Add the decision-maker once you know who it is.
                </p>
              )}
              {people.map((person) => (
                <div key={person.id} className="rounded-lg border border-border p-3 text-sm group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {person.fullName}
                      </p>
                      {person.role && <p className="text-xs text-muted-foreground">{person.role}</p>}
                    </div>
                    <div className="flex shrink-0 opacity-60 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Edit ${person.fullName}`}
                        onClick={() => setPersonDialog({ open: true, person })}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-destructive-foreground"
                        aria-label={`Remove ${person.fullName}`}
                        onClick={() => {
                          if (window.confirm(`Delete ${person.fullName}?`)) deleteContact(person.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs">
                    {person.email && (
                      <a href={`mailto:${person.email}`} className="block text-muted-foreground hover:text-primary truncate">
                        {person.email}
                      </a>
                    )}
                    {person.phone && (
                      <a href={`tel:${person.phone}`} className="block text-muted-foreground hover:text-primary">
                        {person.phone}
                      </a>
                    )}
                  </div>
                  {person.notes && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Notes</summary>
                      <p className="mt-1 text-xs whitespace-pre-wrap text-foreground">{person.notes}</p>
                    </details>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="text-lg">Timeline</CardTitle>
              <AddActivityDialog companyId={company.id} />
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nothing logged yet.</p>
              ) : (
                <div className="space-y-3">
                  {activities.slice(0, timelineLimit).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 text-sm group">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {activityIcons[activity.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground break-words">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                          {personName(activity.contactId) ? ` · ${personName(activity.contactId)}` : ''}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive-foreground"
                        aria-label="Delete activity"
                        onClick={() => deleteActivity(activity.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {activities.length > timelineLimit && (
                    <button
                      className="w-full text-center text-xs text-muted-foreground hover:text-foreground pt-1"
                      onClick={() => setTimelineLimit((limit) => limit + TIMELINE_PAGE)}
                    >
                      Show older ({activities.length - timelineLimit} more)
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: what to do */}
        <div className="lg:col-span-3 space-y-6">
          <CompanySequenceCard company={company} />

          <CompanyResearchCard company={company} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(event) => handleNotesChange(event.target.value)}
                placeholder="What you know about them: decision-maker, situation, what they care about…"
                className="min-h-32 resize-y"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Tasks</CardTitle>
              <AddTaskDialog companyId={company.id} />
            </CardHeader>
            <CardContent className="space-y-3">
              {openTasks.length === 0 && completedTasks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">No tasks yet.</p>
              )}
              {openTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggleComplete={toggleTaskComplete}
                  onDelete={deleteTask}
                  onReschedule={rescheduleTask}
                  onTaskClick={setSelectedTask}
                />
              ))}
              {completedTasks.length > 0 && (
                <details className="pt-2 border-t">
                  <summary className="text-xs text-muted-foreground cursor-pointer py-1">
                    Completed ({completedTasks.length})
                  </summary>
                  <div className="space-y-3 pt-2">
                    {completedTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onToggleComplete={toggleTaskComplete}
                        onDelete={deleteTask}
                        onTaskClick={setSelectedTask}
                      />
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>

          <CompanyEmails company={company} people={people} />
        </div>
      </div>

      <EditCompanyDialog
        company={company}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={(fields) => updateCompany(company.id, fields)}
      />
      <PersonDialog
        person={personDialog.person}
        open={personDialog.open}
        onOpenChange={(open) => setPersonDialog((current) => ({ ...current, open }))}
        onSave={(fields) => {
          if (personDialog.person) {
            updateContact(personDialog.person.id, {
              ...fields,
              company: company.name,
              notesLastEdited: fields.notes !== personDialog.person.notes ? new Date().toISOString() : personDialog.person.notesLastEdited,
            });
          } else {
            addPerson(company.id, fields);
          }
        }}
      />
      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
      />
    </div>
  );
}
