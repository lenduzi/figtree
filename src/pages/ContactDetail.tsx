import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Mail, Phone, Trash2, Edit2, Save } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { TaskItem } from '@/components/TaskItem';
import { AddTaskDialog } from '@/components/AddTaskDialog';
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
import { format } from 'date-fns';

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { 
    getContactById, 
    getStageById, 
    getContactTasks, 
    stages, 
    updateContact, 
    deleteContact,
    toggleTaskComplete,
    deleteTask,
  } = useCRMContext();

  const contact = getContactById(id || '');
  const stage = contact ? getStageById(contact.stageId) : undefined;
  const contactTasks = getContactTasks(id || '');

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    fullName: '',
    company: '',
    email: '',
    phone: '',
    stageId: '',
  });
  const [notes, setNotes] = useState('');
  const [notesTimeout, setNotesTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (contact) {
      setEditData({
        fullName: contact.fullName,
        company: contact.company,
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
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contact Info */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-start justify-between">
            <CardTitle className="text-lg">Contact Info</CardTitle>
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
          <CardContent className="space-y-4">
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
                  <Label>Company</Label>
                  <Input
                    value={editData.company}
                    onChange={(e) => setEditData({ ...editData, company: e.target.value })}
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
                  <h2 className="text-xl font-semibold text-foreground">{contact.fullName}</h2>
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
                <div className="space-y-2 text-sm">
                  {contact.company && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                      {contact.company}
                    </div>
                  )}
                  {contact.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <a href={`mailto:${contact.email}`} className="hover:text-primary">
                        {contact.email}
                      </a>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <a href={`tel:${contact.phone}`} className="hover:text-primary">
                        {contact.phone}
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Notes & Tasks */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                Notes
                {contact.notesLastEdited && (
                  <span className="text-xs font-normal text-muted-foreground">
                    Last edited {format(new Date(contact.notesLastEdited), 'MMM d, h:mm a')}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Add notes about this contact..."
                className="min-h-32 resize-none"
              />
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Tasks & Reminders</CardTitle>
              <AddTaskDialog contactId={contact.id} />
            </CardHeader>
            <CardContent className="space-y-3">
              {openTasks.length === 0 && completedTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
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
                    />
                  ))}
                  {completedTasks.length > 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-xs text-muted-foreground mb-3">
                        Completed ({completedTasks.length})
                      </p>
                      {completedTasks.map(task => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          onToggleComplete={toggleTaskComplete}
                          onDelete={deleteTask}
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
    </div>
  );
}
