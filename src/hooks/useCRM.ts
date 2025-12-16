import { useState, useEffect, useCallback } from 'react';
import { Contact, Task, Stage, Activity, ActivityType, DEFAULT_STAGES } from '@/types/crm';
import { addDays, format } from 'date-fns';

const STORAGE_KEYS = {
  contacts: 'simplecrm_contacts',
  tasks: 'simplecrm_tasks',
  stages: 'simplecrm_stages',
  activities: 'simplecrm_activities',
};

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function useCRM() {
  const [contacts, setContacts] = useState<Contact[]>(() => 
    loadFromStorage(STORAGE_KEYS.contacts, [])
  );
  const [tasks, setTasks] = useState<Task[]>(() => 
    loadFromStorage(STORAGE_KEYS.tasks, [])
  );
  const [stages, setStages] = useState<Stage[]>(() => 
    loadFromStorage(STORAGE_KEYS.stages, DEFAULT_STAGES)
  );
  const [activities, setActivities] = useState<Activity[]>(() =>
    loadFromStorage(STORAGE_KEYS.activities, [])
  );

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.contacts, contacts);
  }, [contacts]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.tasks, tasks);
  }, [tasks]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.stages, stages);
  }, [stages]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.activities, activities);
  }, [activities]);

  // Activity operations
  const addActivity = useCallback((contactId: string, type: ActivityType, description: string) => {
    const newActivity: Activity = {
      id: crypto.randomUUID(),
      contactId,
      type,
      description,
      timestamp: new Date().toISOString(),
    };
    setActivities(prev => [newActivity, ...prev]);
    
    // Update last interaction date
    setContacts(prev => prev.map(c =>
      c.id === contactId 
        ? { ...c, lastInteractionDate: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : c
    ));
    
    return newActivity;
  }, []);

  const getContactActivities = useCallback((contactId: string) => {
    return activities.filter(a => a.contactId === contactId);
  }, [activities]);

  // Contact operations
  const addContact = useCallback((contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newContact: Contact = {
      ...contact,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setContacts(prev => [...prev, newContact]);
    return newContact;
  }, []);

  const updateContact = useCallback((id: string, updates: Partial<Contact>) => {
    setContacts(prev => prev.map(c => 
      c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
    ));
  }, []);

  const deleteContact = useCallback((id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    setTasks(prev => prev.filter(t => t.contactId !== id));
    setActivities(prev => prev.filter(a => a.contactId !== id));
  }, []);

  const moveContactToStage = useCallback((contactId: string, newStageId: string) => {
    const contact = contacts.find(c => c.id === contactId);
    const oldStage = stages.find(s => s.id === contact?.stageId);
    const newStage = stages.find(s => s.id === newStageId);
    
    if (contact && oldStage && newStage && oldStage.id !== newStage.id) {
      addActivity(contactId, 'stage_change', `Moved from ${oldStage.name} to ${newStage.name}`);
    }
    
    updateContact(contactId, { stageId: newStageId });
  }, [contacts, stages, updateContact, addActivity]);

  const logInteraction = useCallback((contactId: string) => {
    setContacts(prev => prev.map(c =>
      c.id === contactId 
        ? { ...c, lastInteractionDate: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : c
    ));
  }, []);

  // Task operations
  const addTask = useCallback((task: Omit<Task, 'id' | 'createdAt'>) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setTasks(prev => [...prev, newTask]);
    return newTask;
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const toggleTaskComplete = useCallback((id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task && !task.completed) {
      // Log activity when completing a task
      addActivity(task.contactId, 'task_completed', `Completed: ${task.title}`);
    }
    setTasks(prev => prev.map(t => 
      t.id === id ? { ...t, completed: !t.completed } : t
    ));
  }, [tasks, addActivity]);

  const rescheduleTask = useCallback((id: string, newDate: Date) => {
    const formattedDate = format(newDate, 'yyyy-MM-dd');
    setTasks(prev => prev.map(t => 
      t.id === id ? { ...t, dueDate: formattedDate } : t
    ));
  }, []);

  // Stage operations
  const updateStage = useCallback((id: string, updates: Partial<Stage>) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const reorderStages = useCallback((newStages: Stage[]) => {
    setStages(newStages.map((s, i) => ({ ...s, order: i })));
  }, []);

  // Computed values
  const getContactTasks = useCallback((contactId: string) => {
    return tasks.filter(t => t.contactId === contactId);
  }, [tasks]);

  const getTasksForToday = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    return tasks.filter(t => !t.completed && t.dueDate <= today);
  }, [tasks]);

  const getOverdueTasks = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    return tasks.filter(t => !t.completed && t.dueDate < today);
  }, [tasks]);

  const getUpcomingTasks = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    return tasks.filter(t => !t.completed && t.dueDate > today);
  }, [tasks]);

  const getContactById = useCallback((id: string) => {
    return contacts.find(c => c.id === id);
  }, [contacts]);

  const getStageById = useCallback((id: string) => {
    return stages.find(s => s.id === id);
  }, [stages]);

  return {
    contacts,
    tasks,
    stages,
    activities,
    addContact,
    updateContact,
    deleteContact,
    moveContactToStage,
    logInteraction,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskComplete,
    rescheduleTask,
    updateStage,
    reorderStages,
    addActivity,
    getContactActivities,
    getContactTasks,
    getTasksForToday,
    getOverdueTasks,
    getUpcomingTasks,
    getContactById,
    getStageById,
  };
}
