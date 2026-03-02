import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Building2, Mail, Phone, Trash2, Edit2, Save, Clock, CheckCircle2, ArrowRight, PhoneMissed, Globe, User as UserIcon, FolderOpen } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { TaskItem } from '@/components/TaskItem';
import { TaskDetailDialog } from '@/components/TaskDetailDialog';
import { AddTaskDialog } from '@/components/AddTaskDialog';
import { AddActivityDialog } from '@/components/AddActivityDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { format, formatDistanceToNow } from 'date-fns';
import { ActivityType, Task } from '@/types/crm';

const activityIcons: Record<ActivityType, React.ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  call_attempted: <PhoneMissed className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  meeting: <Building2 className="h-4 w-4" />,
  note: <Edit2 className="h-4 w-4" />,
  stage_change: <ArrowRight className="h-4 w-4" />,
  task_completed: <CheckCircle2 className="h-4 w-4" />,
};

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { 
    getContactById, 
    getStageById, 
    getContactTasks,
    getContactActivities,
    deleteActivity,
    stages, 
    updateContact, 
    deleteContact,
    meContactId,
    toggleTaskComplete,
    deleteTask,
    rescheduleTask,
    projects,
  } = useCRMContext();

  const contact = getContactById(id || '');
  const stage = contact ? getStageById(contact.stageId) : undefined;
  const contactTasks = getContactTasks(id || '');
  const contactActivities = getContactActivities(id || '');
  const contactProjects = contact ? projects.filter((project) => project.clientId === contact.id) : [];

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    fullName: '',
    role: '',
    company: '',
    website: '',
    email: '',
    phone: '',
    stageId: '',
  });
  const [notes, setNotes] = useState('');
  const [notesTimeout, setNotesTimeout] = useState<NodeJS.Timeout | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    if (contact) {
      setEditData({
        fullName: contact.fullName,
        role: contact.role || '',
        company: contact.company,
        website: contact.website || '',
        email: contact.email,
        phone: contact.phone,
        stageId: contact.stageId,
      });
      setNotes(contact.notes);
    }
  }, [contact]);

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    if (notesTimeout) clearTimeout(notesTimeout);
    
    const timeout = setTimeout(() => {
      if (id) {
        updateContact(id, { 
          notes: value, 
          notesLastEdited: new Date().toISOString() 
        });
      }
    }, 1000);
    
    setNotesTimeout(timeout);
  }, [id, updateContact, notesTimeout]);


  const handleSaveEdit = () => {
    if (id && editData.fullName.trim()) {
      updateContact(id, editData);
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (id) {
      deleteContact(id);
      navigate('/contacts');
    }
  };

  if (!contact) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Contact not found</p>
        <Button variant="link" onClick={() => navigate('/contacts')}>
          Back to Contacts
        </Button>
      </div>
    );
  }

  const openTasks = contactTasks.filter(t => !t.completed).sort((a, b) => 
    new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );
  const completedTasks = contactTasks.filter(t => t.completed);

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-5xl lg:max-w-6xl 2xl:max-w-7xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 lg:mb-8 transition-colors lg:text-lg"
      >
        <ArrowLeft className="h-4 w-4 lg:h-5 lg:w-5" />
        Back
      </button>

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-3">
        {/* Left Column: Contact Info + Activity Log */}
        <div className="lg:col-span-1 space-y-6 lg:space-y-8">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between lg:p-6">
            <CardTitle className="text-lg lg:text-xl">Contact Info</CardTitle>
            <div className="flex gap-2">
              {isEditing ? (
                <Button size="sm" onClick={handleSaveEdit}>
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-destructive-foreground">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Contact?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {contact.fullName} and all associated tasks.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 lg:px-6 lg:pb-6">
            {isEditing ? (
              <>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={editData.fullName}
                    onChange={(e) => setEditData({ ...editData, fullName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input
                    value={editData.role}
                    onChange={(e) => setEditData({ ...editData, role: e.target.value })}
                    placeholder="CMO, Sales Manager, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input
                    value={editData.company}
                    onChange={(e) => setEditData({ ...editData, company: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={editData.website}
                    onChange={(e) => setEditData({ ...editData, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editData.email}
                    onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={editData.phone}
                    onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select
                    value={editData.stageId}
                    onValueChange={(v) => setEditData({ ...editData, stageId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl lg:text-2xl font-semibold text-foreground">{contact.fullName}</h2>
                    {contact.id === meContactId && (
                      <Badge variant="outline" className="px-1.5 py-0.5">
                        <UserIcon className="h-3 w-3" />
                        <span className="sr-only">Me</span>
                      </Badge>
                    )}
                  </div>
                  {contact.role && (
                    <p className="text-sm lg:text-base text-muted-foreground mt-1">{contact.role}</p>
                  )}
                  {stage && (
                    <Badge 
                      className="mt-2"
                      style={{ 
                        backgroundColor: `${stage.color}20`,
                        color: stage.color,
                      }}
                    >
                      {stage.name}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2 lg:space-y-3 text-sm lg:text-base">
                  {contact.company && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="h-4 w-4 lg:h-5 lg:w-5" />
                      {contact.company}
                    </div>
                  )}
                  {contactProjects.length > 0 && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <FolderOpen className="h-4 w-4 lg:h-5 lg:w-5 mt-0.5" />
                      <div className="flex flex-col gap-1">
                        {contactProjects.map((project) => (
                          <Link
                            key={project.id}
                            to={`/projects?projectId=${project.id}`}
                            className="hover:text-primary"
                          >
                            View project ({project.status})
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {contact.website && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="h-4 w-4 lg:h-5 lg:w-5" />
                      <a 
                        href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:text-primary truncate"
                      >
                        {contact.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  )}
                  {contact.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4 lg:h-5 lg:w-5" />
                      <a href={`mailto:${contact.email}`} className="hover:text-primary">
                        {contact.email}
                      </a>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4 lg:h-5 lg:w-5" />
                      <a href={`tel:${contact.phone}`} className="hover:text-primary">
                        {contact.phone}
                      </a>
                    </div>
                  )}
                  {contact.lastInteractionDate && (
                    <div className="flex items-center gap-2 text-muted-foreground pt-2 lg:pt-3 border-t">
                      <Clock className="h-4 w-4 lg:h-5 lg:w-5" />
                      Last contact: {formatDistanceToNow(new Date(contact.lastInteractionDate), { addSuffix: true })}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

          {/* Activity Log - on left column */}
          <Card>
            <CardHeader className="lg:p-6 space-y-3">
              <CardTitle className="text-lg lg:text-xl">Activity Log</CardTitle>
              <AddActivityDialog contactId={contact.id} />
            </CardHeader>
            <CardContent className="lg:px-6 lg:pb-6">
              {contactActivities.length === 0 ? (
                <p className="text-sm lg:text-base text-muted-foreground text-center py-4">
                  No activity yet. Log calls, emails, or meetings to track interactions.
                </p>
              ) : (
                <div className="space-y-3 lg:space-y-4">
                  {contactActivities.slice(0, 10).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 lg:gap-4 text-sm lg:text-base group">
                      <div className="h-8 w-8 lg:h-10 lg:w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {activityIcons[activity.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground">{activity.description}</p>
                        <p className="text-xs lg:text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive-foreground"
                        onClick={() => deleteActivity(activity.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {contactActivities.length > 10 && (
                    <p className="text-xs lg:text-sm text-muted-foreground text-center pt-2">
                      + {contactActivities.length - 10} more activities
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Notes & Tasks */}
        <div className="lg:col-span-2 space-y-6 lg:space-y-8">
          {/* Notes */}
          <Card>
            <CardHeader className="lg:p-6">
              <CardTitle className="text-lg lg:text-xl flex items-center justify-between">
                Notes
                {contact.notesLastEdited && (
                  <span className="text-xs lg:text-sm font-normal text-muted-foreground">
                    Last edited {format(new Date(contact.notesLastEdited), 'MMM d, h:mm a')}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="lg:px-6 lg:pb-6">
              <Textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Add notes about this contact..."
                className="min-h-32 lg:min-h-40 lg:text-base resize-none"
              />
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between lg:p-6">
              <CardTitle className="text-lg lg:text-xl">Tasks & Reminders</CardTitle>
              <AddTaskDialog contactId={contact.id} />
            </CardHeader>
            <CardContent className="space-y-3 lg:space-y-4 lg:px-6 lg:pb-6">
              {openTasks.length === 0 && completedTasks.length === 0 ? (
                <p className="text-sm lg:text-base text-muted-foreground text-center py-4">
                  No tasks yet. Add a task to track follow-ups.
                </p>
              ) : (
                <>
                  {openTasks.map(task => (
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
                    <div className="pt-4 lg:pt-5 border-t">
                      <p className="text-xs lg:text-sm text-muted-foreground mb-3">
                        Completed ({completedTasks.length})
                      </p>
                      {completedTasks.map(task => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          onToggleComplete={toggleTaskComplete}
                          onDelete={deleteTask}
                          onTaskClick={setSelectedTask}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
      />
    </div>
  );
}
