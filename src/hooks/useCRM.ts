import { useState, useEffect, useCallback } from 'react';
import { Contact, Task, Stage, DEFAULT_STAGES } from '@/types/crm';

const STORAGE_KEYS = {
  contacts: 'simplecrm_contacts',
  tasks: 'simplecrm_tasks',
  stages: 'simplecrm_stages',
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

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.contacts, contacts);
  }, [contacts]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.tasks, tasks);
  }, [tasks]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.stages, stages);
  }, [stages]);

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
  }, []);

  const moveContactToStage = useCallback((contactId: string, stageId: string) => {
    updateContact(contactId, { stageId });
  }, [updateContact]);

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
    setTasks(prev => prev.map(t => 
      t.id === id ? { ...t, completed: !t.completed } : t
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
    addContact,
    updateContact,
    deleteContact,
    moveContactToStage,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskComplete,
    updateStage,
    reorderStages,
    getContactTasks,
    getTasksForToday,
    getOverdueTasks,
    getUpcomingTasks,
    getContactById,
    getStageById,
  };
}
