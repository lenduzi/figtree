import { useState, useEffect, useCallback } from 'react';
import { Contact, Task, Stage, Activity, ActivityType, DEFAULT_STAGES, ResearchList, ResearchEntry, ResearchStatus, ResearchPriority } from '@/types/crm';
import { addDays, format } from 'date-fns';

const STORAGE_KEYS = {
  contacts: 'simplecrm_contacts',
  tasks: 'simplecrm_tasks',
  stages: 'simplecrm_stages',
  activities: 'simplecrm_activities',
  researchLists: 'simplecrm_research_lists',
  researchEntries: 'simplecrm_research_entries',
};
const HAS_USED_KEY = 'simplecrm_has_used';
const ME_CONTACT_ID_KEY = 'simplecrm_me_contact_id';
const ME_CONTACT_CREATED_KEY = 'simplecrm_me_contact_created';
const FIRST_ACTION_KEY = 'simplecrm_first_action_seen';
const FIRST_ACTION_BANNER_DISMISSED_KEY = 'simplecrm_first_action_banner_dismissed';
const LEGACY_FIRST_TASK_COMPLETED_KEY = 'simplecrm_first_task_completed';

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

function markHasUsed() {
  try {
    if (localStorage.getItem(HAS_USED_KEY) !== '1') {
      localStorage.setItem(HAS_USED_KEY, '1');
    }
  } catch {
    // ignore storage errors
  }
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
  const [researchLists, setResearchLists] = useState<ResearchList[]>(() =>
    loadFromStorage(STORAGE_KEYS.researchLists, [])
  );
  const [researchEntries, setResearchEntries] = useState<ResearchEntry[]>(() =>
    loadFromStorage(STORAGE_KEYS.researchEntries, [])
  );
  const [meContactId, setMeContactId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ME_CONTACT_ID_KEY);
    } catch {
      return null;
    }
  });
  const [firstActionSeen, setFirstActionSeen] = useState(() => {
    try {
      const hasUsed = localStorage.getItem(HAS_USED_KEY) === '1';
      const legacySeen = localStorage.getItem(LEGACY_FIRST_TASK_COMPLETED_KEY) === '1';
      const currentSeen = localStorage.getItem(FIRST_ACTION_KEY) === '1';
      return currentSeen || legacySeen || hasUsed;
    } catch {
      return false;
    }
  });
  const [firstActionBannerDismissed, setFirstActionBannerDismissed] = useState(() => {
    try {
      const hasUsed = localStorage.getItem(HAS_USED_KEY) === '1';
      const legacySeen = localStorage.getItem(LEGACY_FIRST_TASK_COMPLETED_KEY) === '1';
      const currentSeen = localStorage.getItem(FIRST_ACTION_KEY) === '1';
      const dismissed = localStorage.getItem(FIRST_ACTION_BANNER_DISMISSED_KEY) === '1';
      return dismissed || (hasUsed && !legacySeen && !currentSeen);
    } catch {
      return false;
    }
  });

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

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.researchLists, researchLists);
  }, [researchLists]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.researchEntries, researchEntries);
  }, [researchEntries]);

  useEffect(() => {
    if (contacts.length > 0) return;
    let hasCreated = false;
    try {
      hasCreated = localStorage.getItem(ME_CONTACT_CREATED_KEY) === '1';
    } catch {
      hasCreated = false;
    }
    if (hasCreated) return;

    const now = new Date().toISOString();
    const stageId = stages[0]?.id || DEFAULT_STAGES[0]?.id || '';
    const newContact: Contact = {
      id: crypto.randomUUID(),
      fullName: 'Me',
      role: '',
      company: '',
      website: '',
      email: '',
      phone: '',
      stageId,
      notes: '',
      createdAt: now,
      updatedAt: now,
    };

    try {
      localStorage.setItem(ME_CONTACT_CREATED_KEY, '1');
      localStorage.setItem(ME_CONTACT_ID_KEY, newContact.id);
    } catch {
      // ignore storage errors
    }
    setMeContactId(newContact.id);
    setContacts(prev => (prev.length === 0 ? [newContact] : prev));
  }, [contacts.length, stages]);

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

  const deleteActivity = useCallback((id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id));
  }, []);

  const getContactActivities = useCallback((contactId: string) => {
    return activities.filter(a => a.contactId === contactId);
  }, [activities]);

  // Contact operations
  const markFirstAction = useCallback(() => {
    if (firstActionSeen) return;
    setFirstActionSeen(true);
    try {
      localStorage.setItem(FIRST_ACTION_KEY, '1');
    } catch {
      // ignore storage errors
    }
  }, [firstActionSeen]);

  const addContact = useCallback((contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newContact: Contact = {
      ...contact,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setContacts(prev => [...prev, newContact]);
    markHasUsed();
    markFirstAction();
    return newContact;
  }, [markFirstAction]);

  const updateContact = useCallback((id: string, updates: Partial<Contact>) => {
    setContacts(prev => prev.map(c => 
      c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
    ));
  }, []);

  const deleteContact = useCallback((id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    setTasks(prev => prev.filter(t => t.contactId !== id));
    setActivities(prev => prev.filter(a => a.contactId !== id));
    if (id === meContactId) {
      try {
        localStorage.removeItem(ME_CONTACT_ID_KEY);
      } catch {
        // ignore storage errors
      }
      setMeContactId(null);
    }
  }, [meContactId]);

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
    markHasUsed();
    markFirstAction();
    return newTask;
  }, [markFirstAction]);

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

  // Research List operations
  const addResearchList = useCallback((name: string) => {
    const newList: ResearchList = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setResearchLists(prev => [...prev, newList]);
    markFirstAction();
    return newList;
  }, [markFirstAction]);

  const updateResearchList = useCallback((id: string, updates: Partial<ResearchList>) => {
    setResearchLists(prev => prev.map(l => 
      l.id === id ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l
    ));
  }, []);

  const deleteResearchList = useCallback((id: string) => {
    setResearchLists(prev => prev.filter(l => l.id !== id));
    setResearchEntries(prev => prev.filter(e => e.listId !== id));
  }, []);

  // Research Entry operations
  const addResearchEntry = useCallback((listId: string, entry: Partial<Omit<ResearchEntry, 'id' | 'listId' | 'createdAt' | 'updatedAt'>>) => {
    const newEntry: ResearchEntry = {
      id: crypto.randomUUID(),
      listId,
      company: entry.company || '',
      poc: entry.poc || '',
      email: entry.email || '',
      website: entry.website || '',
      industry: entry.industry || '',
      notes: entry.notes || '',
      priority: entry.priority || 'medium',
      status: entry.status || 'researching',
      linkedContactId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setResearchEntries(prev => [...prev, newEntry]);
    markFirstAction();
    return newEntry;
  }, [markFirstAction]);

  const updateResearchEntry = useCallback((id: string, updates: Partial<ResearchEntry>) => {
    setResearchEntries(prev => prev.map(e => 
      e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
    ));
  }, []);

  const deleteResearchEntry = useCallback((id: string) => {
    setResearchEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const getEntriesForList = useCallback((listId: string) => {
    return researchEntries.filter(e => e.listId === listId);
  }, [researchEntries]);

  const promoteEntryToContact = useCallback((entryId: string, stageId: string, createTask?: boolean) => {
    const entry = researchEntries.find(e => e.id === entryId);
    if (!entry) return null;

    // Create contact from entry
    const newContact = addContact({
      fullName: entry.poc || entry.company,
      company: entry.company,
      email: entry.email,
      phone: '',
      website: entry.website,
      role: '',
      stageId,
      notes: entry.notes,
    });

    // Link entry to contact and mark as promoted
    updateResearchEntry(entryId, {
      linkedContactId: newContact.id,
      status: 'promoted',
    });

    // Optionally create a follow-up task
    if (createTask) {
      addTask({
        contactId: newContact.id,
        title: `Follow up with ${entry.poc || entry.company}`,
        description: `Promoted from research list`,
        dueDate: format(new Date(), 'yyyy-MM-dd'),
        hasReminder: true,
        completed: false,
      });
    }

    return newContact;
  }, [researchEntries, addContact, updateResearchEntry, addTask]);

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

  const dismissFirstTaskBanner = useCallback(() => {
    setFirstActionBannerDismissed(true);
    try {
      localStorage.setItem(FIRST_ACTION_BANNER_DISMISSED_KEY, '1');
    } catch {
      // ignore storage errors
    }
  }, []);

  const showFirstTaskBanner = firstActionSeen && !firstActionBannerDismissed;

  return {
    contacts,
    tasks,
    stages,
    activities,
    researchLists,
    researchEntries,
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
    deleteActivity,
    getContactActivities,
    getContactTasks,
    getTasksForToday,
    getOverdueTasks,
    getUpcomingTasks,
    getContactById,
    getStageById,
    meContactId,
    // Research operations
    addResearchList,
    updateResearchList,
    deleteResearchList,
    addResearchEntry,
    updateResearchEntry,
    deleteResearchEntry,
    getEntriesForList,
    promoteEntryToContact,
    showFirstTaskBanner,
    dismissFirstTaskBanner,
  };
}
