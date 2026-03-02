import { useState, useEffect, useCallback } from 'react';
import { Contact, Task, Stage, Activity, ActivityType, DEFAULT_STAGES, ResearchList, ResearchEntry, ResearchStatus, ResearchPriority, EisenhowerItem, Project, ProjectVisit, ProjectStatus, VisitStatus, Creator } from '@/types/crm';
import { addDays, format } from 'date-fns';

const STORAGE_KEYS = {
  contacts: 'simplecrm_contacts',
  tasks: 'simplecrm_tasks',
  stages: 'simplecrm_stages',
  activities: 'simplecrm_activities',
  researchLists: 'simplecrm_research_lists',
  researchEntries: 'simplecrm_research_entries',
  eisenhowerItems: 'simplecrm_eisenhower_items',
  projects: 'simplecrm_projects',
  projectVisits: 'simplecrm_project_visits',
  creators: 'simplecrm_creators',
};
const HAS_USED_KEY = 'simplecrm_has_used';
const ME_CONTACT_ID_KEY = 'simplecrm_me_contact_id';
const ME_CONTACT_CREATED_KEY = 'simplecrm_me_contact_created';
const FIRST_ACTION_KEY = 'simplecrm_first_action_seen';
const FIRST_ACTION_BANNER_DISMISSED_KEY = 'simplecrm_first_action_banner_dismissed';
const FIRST_ACTION_NUDGE_DISMISSED_KEY = 'simplecrm_first_action_nudge_dismissed';
const LEGACY_FIRST_TASK_COMPLETED_KEY = 'simplecrm_first_task_completed';
const PILOT_AGREED_STAGE_NAME = 'pilot agreed';

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

const normalizeStageName = (name: string) => name.trim().toLowerCase();
const isPilotAgreedStageName = (name: string) => normalizeStageName(name) === PILOT_AGREED_STAGE_NAME;

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
  const [eisenhowerItems, setEisenhowerItems] = useState<EisenhowerItem[]>(() =>
    loadFromStorage(STORAGE_KEYS.eisenhowerItems, [])
  );
  const [projects, setProjects] = useState<Project[]>(() =>
    loadFromStorage(STORAGE_KEYS.projects, [])
  );
  const [projectVisits, setProjectVisits] = useState<ProjectVisit[]>(() => {
    const stored = loadFromStorage(STORAGE_KEYS.projectVisits, []);
    return stored.map((visit: any) => {
      const { creatorIds, creatorId, notes, ...rest } = visit || {};
      const normalizedCreatorIds = Array.isArray(creatorIds) ? creatorIds.filter(Boolean) : [];
      if (creatorId && !normalizedCreatorIds.includes(creatorId)) {
        normalizedCreatorIds.push(creatorId);
      }
      return {
        ...rest,
        creatorIds: normalizedCreatorIds,
        status: (rest.status as VisitStatus) || 'Sourcing',
        briefing: rest.briefing ?? notes ?? '',
      } as ProjectVisit;
    });
  });
  const [creators, setCreators] = useState<Creator[]>(() =>
    loadFromStorage(STORAGE_KEYS.creators, [])
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
  const [firstActionNudgeDismissed, setFirstActionNudgeDismissed] = useState(() => {
    try {
      return localStorage.getItem(FIRST_ACTION_NUDGE_DISMISSED_KEY) === '1';
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
    saveToStorage(STORAGE_KEYS.eisenhowerItems, eisenhowerItems);
  }, [eisenhowerItems]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.projects, projects);
  }, [projects]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.projectVisits, projectVisits);
  }, [projectVisits]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.creators, creators);
  }, [creators]);

  useEffect(() => {
    setEisenhowerItems(prev => {
      const filtered = prev.filter(item => item.importance || item.urgency);
      return filtered.length === prev.length ? prev : filtered;
    });
  }, []);

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

  const defaultProjectStatus: ProjectStatus = 'Preparing';

  const isPilotAgreedStageId = useCallback((stageId: string) => {
    const stage = stages.find(s => s.id === stageId);
    return stage ? isPilotAgreedStageName(stage.name) : false;
  }, [stages]);

  const ensureProjectForContact = useCallback((contactId: string) => {
    setProjects(prev => {
      if (prev.some(project => project.clientId === contactId)) {
        return prev;
      }
      const now = new Date().toISOString();
      const newProject: Project = {
        id: crypto.randomUUID(),
        clientId: contactId,
        status: defaultProjectStatus,
        notes: '',
        links: '',
        createdAt: now,
        updatedAt: now,
      };
      return [...prev, newProject];
    });
  }, [defaultProjectStatus]);

  useEffect(() => {
    if (contacts.length === 0 || stages.length === 0) return;
    const pilotStageIds = stages
      .filter(stage => isPilotAgreedStageName(stage.name))
      .map(stage => stage.id);
    if (pilotStageIds.length === 0) return;

    const pilotContacts = contacts.filter(contact => pilotStageIds.includes(contact.stageId));
    if (pilotContacts.length === 0) return;

    const now = new Date().toISOString();
    setProjects(prev => {
      const missingContacts = pilotContacts.filter(
        contact => !prev.some(project => project.clientId === contact.id),
      );
      if (missingContacts.length === 0) return prev;
      return [
        ...prev,
        ...missingContacts.map(contact => ({
          id: crypto.randomUUID(),
          clientId: contact.id,
          status: defaultProjectStatus,
          notes: '',
          links: '',
          createdAt: now,
          updatedAt: now,
        })),
      ];
    });
  }, [contacts, stages, defaultProjectStatus]);

  // Activity operations
  const addActivity = useCallback((contactId: string, type: ActivityType, description: string, timestamp?: Date) => {
    const resolvedTimestamp = timestamp ? timestamp.toISOString() : new Date().toISOString();
    const newActivity: Activity = {
      id: crypto.randomUUID(),
      contactId,
      type,
      description,
      timestamp: resolvedTimestamp,
    };
    setActivities(prev => [newActivity, ...prev]);
    
    // Update last interaction date
    setContacts(prev => prev.map(c =>
      c.id === contactId ? (() => {
        const currentLast = c.lastInteractionDate ? new Date(c.lastInteractionDate).getTime() : 0;
        const nextTime = new Date(resolvedTimestamp).getTime();
        const shouldUpdateLast = !Number.isNaN(nextTime) && nextTime >= currentLast;
        return {
          ...c,
          lastInteractionDate: shouldUpdateLast ? resolvedTimestamp : c.lastInteractionDate,
          updatedAt: new Date().toISOString(),
        };
      })() : c
    ));
    
    return newActivity;
  }, []);

  const deleteActivity = useCallback((id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id));
  }, []);

  const getContactActivities = useCallback((contactId: string) => {
    return activities
      .filter(a => a.contactId === contactId)
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
    if (isPilotAgreedStageId(newContact.stageId)) {
      ensureProjectForContact(newContact.id);
    }
    markHasUsed();
    markFirstAction();
    return newContact;
  }, [ensureProjectForContact, isPilotAgreedStageId, markFirstAction]);

  const updateContact = useCallback((id: string, updates: Partial<Contact>) => {
    const current = contacts.find(c => c.id === id);
    setContacts(prev => prev.map(c => 
      c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
    ));
    if (
      updates.stageId &&
      current &&
      updates.stageId !== current.stageId &&
      isPilotAgreedStageId(updates.stageId)
    ) {
      ensureProjectForContact(id);
    }
  }, [contacts, ensureProjectForContact, isPilotAgreedStageId]);

  const deleteContact = useCallback((id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    setTasks(prev => prev.filter(t => t.contactId !== id));
    setActivities(prev => prev.filter(a => a.contactId !== id));
    const removedProjectIds = projects.filter(project => project.clientId === id).map(project => project.id);
    if (removedProjectIds.length > 0) {
      setProjects(prev => prev.filter(project => project.clientId !== id));
      setProjectVisits(prev => prev.filter(visit => !removedProjectIds.includes(visit.projectId)));
    }
    if (id === meContactId) {
      try {
        localStorage.removeItem(ME_CONTACT_ID_KEY);
      } catch {
        // ignore storage errors
      }
      setMeContactId(null);
    }
  }, [meContactId, projects]);

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

  useEffect(() => {
    if (eisenhowerItems.length === 0) return;
    setEisenhowerItems(prev => {
      let changed = false;
      const updated = prev.map(item => {
        if (!item.linkedTaskId) return item;
        const linkedTask = tasks.find(t => t.id === item.linkedTaskId);
        if (!linkedTask) {
          if (item.linkedTaskId !== null) {
            changed = true;
            return { ...item, linkedTaskId: null };
          }
          return item;
        }
        if (item.completed !== linkedTask.completed) {
          changed = true;
          return { ...item, completed: linkedTask.completed };
        }
        return item;
      });
      return changed ? updated : prev;
    });
  }, [tasks, eisenhowerItems.length]);

  // Eisenhower operations
  const addEisenhowerItem = useCallback((item: Omit<EisenhowerItem, 'id' | 'createdAt'>) => {
    const newItem: EisenhowerItem = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setEisenhowerItems(prev => [...prev, newItem]);
    markHasUsed();
    markFirstAction();
    return newItem;
  }, [markFirstAction]);

  const updateEisenhowerItem = useCallback((id: string, updates: Partial<EisenhowerItem>) => {
    setEisenhowerItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const deleteEisenhowerItem = useCallback((id: string) => {
    setEisenhowerItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const toggleEisenhowerItemComplete = useCallback((id: string) => {
    setEisenhowerItems(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  }, []);

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

  // Project operations
  const addProject = useCallback((project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const existing = projects.find(existingProject => existingProject.clientId === project.clientId);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const newProject: Project = {
      id: crypto.randomUUID(),
      clientId: project.clientId,
      status: project.status || defaultProjectStatus,
      notes: project.notes || '',
      links: project.links || '',
      createdAt: now,
      updatedAt: now,
    };
    setProjects(prev => [...prev, newProject]);
    markHasUsed();
    markFirstAction();
    return newProject;
  }, [defaultProjectStatus, markFirstAction, projects]);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects(prev => prev.map(project =>
      project.id === id ? { ...project, ...updates, updatedAt: new Date().toISOString() } : project
    ));
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(project => project.id !== id));
    setProjectVisits(prev => prev.filter(visit => visit.projectId !== id));
  }, []);

  const addProjectVisit = useCallback((visit: Omit<ProjectVisit, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newVisit: ProjectVisit = {
      id: crypto.randomUUID(),
      projectId: visit.projectId,
      location: visit.location || '',
      date: visit.date || '',
      time: visit.time || '',
      creatorIds: visit.creatorIds || [],
      status: visit.status || 'Sourcing',
      briefing: visit.briefing || '',
      createdAt: now,
      updatedAt: now,
    };
    setProjectVisits(prev => [...prev, newVisit]);
    markHasUsed();
    markFirstAction();
    return newVisit;
  }, [markFirstAction]);

  const updateProjectVisit = useCallback((id: string, updates: Partial<ProjectVisit>) => {
    setProjectVisits(prev => prev.map(visit =>
      visit.id === id ? { ...visit, ...updates, updatedAt: new Date().toISOString() } : visit
    ));
  }, []);

  const deleteProjectVisit = useCallback((id: string) => {
    setProjectVisits(prev => prev.filter(visit => visit.id !== id));
  }, []);

  const getProjectVisits = useCallback((projectId: string) => {
    return projectVisits.filter(visit => visit.projectId === projectId);
  }, [projectVisits]);

  // Creator operations
  const addCreator = useCallback((creator: Omit<Creator, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newCreator: Creator = {
      id: crypto.randomUUID(),
      name: creator.name,
      tiktokHandle: creator.tiktokHandle || '',
      notes: creator.notes || '',
      createdAt: now,
      updatedAt: now,
    };
    setCreators(prev => [...prev, newCreator]);
    markHasUsed();
    markFirstAction();
    return newCreator;
  }, [markFirstAction]);

  const updateCreator = useCallback((id: string, updates: Partial<Creator>) => {
    setCreators(prev => prev.map(creator =>
      creator.id === id ? { ...creator, ...updates, updatedAt: new Date().toISOString() } : creator
    ));
  }, []);

  const deleteCreator = useCallback((id: string) => {
    setCreators(prev => prev.filter(creator => creator.id !== id));
    setProjectVisits(prev => prev.map(visit => {
      if (!visit.creatorIds?.includes(id)) return visit;
      return {
        ...visit,
        creatorIds: visit.creatorIds.filter((creatorId) => creatorId !== id),
        updatedAt: new Date().toISOString(),
      };
    }));
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

  const dismissFirstActionNudge = useCallback(() => {
    setFirstActionNudgeDismissed(true);
    try {
      localStorage.setItem(FIRST_ACTION_NUDGE_DISMISSED_KEY, '1');
    } catch {
      // ignore storage errors
    }
  }, []);

  return {
    contacts,
    tasks,
    stages,
    activities,
    researchLists,
    researchEntries,
    eisenhowerItems,
    projects,
    projectVisits,
    creators,
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
    addEisenhowerItem,
    updateEisenhowerItem,
    deleteEisenhowerItem,
    toggleEisenhowerItemComplete,
    updateStage,
    reorderStages,
    addProject,
    updateProject,
    deleteProject,
    addProjectVisit,
    updateProjectVisit,
    deleteProjectVisit,
    getProjectVisits,
    addCreator,
    updateCreator,
    deleteCreator,
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
    firstActionSeen,
    firstActionNudgeDismissed,
    dismissFirstActionNudge,
  };
}
