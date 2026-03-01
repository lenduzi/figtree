import type { Resource } from "@/lib/resources-store";
import type { OutreachActionLog, OutreachImportSummary, OutreachLead } from "@/types/outreach";
import {
  Activity,
  Contact,
  DEFAULT_STAGES,
  EisenhowerItem,
  Project,
  ProjectVisit,
  Creator,
  ResearchEntry,
  ResearchList,
  Stage,
  Task,
} from "@/types/crm";

const STORAGE_KEYS = {
  contacts: "simplecrm_contacts",
  tasks: "simplecrm_tasks",
  stages: "simplecrm_stages",
  activities: "simplecrm_activities",
  researchLists: "simplecrm_research_lists",
  researchEntries: "simplecrm_research_entries",
  eisenhowerItems: "simplecrm_eisenhower_items",
  projects: "simplecrm_projects",
  projectVisits: "simplecrm_project_visits",
  creators: "simplecrm_creators",
  resources: "simplecrm_resources_v1",
  outreachLeads: "simplecrm_outreach_leads_v1",
  outreachActions: "simplecrm_outreach_actions_v1",
  outreachImports: "simplecrm_outreach_imports_v1",
};

export const CLOUD_BACKUP_TABLE = "user_backups";
export const CLOUD_LAST_SYNC_KEY = "simplecrm_cloud_last_sync";
export const CLOUD_LAST_PULL_KEY = "simplecrm_cloud_last_pull";
export const CLOUD_SYNC_ENABLED_KEY = "simplecrm_cloud_sync_enabled";
export const CLOUD_BOOTSTRAP_KEY = "simplecrm_cloud_bootstrap";
export const OUTREACH_LAST_CHANGE_KEY = "simplecrm_outreach_last_change";

type BackupSettings = {
  stages?: Stage[];
  researchLists?: ResearchList[];
};

type OutreachBackup = {
  leads?: OutreachLead[];
  actions?: OutreachActionLog[];
  imports?: OutreachImportSummary[];
};

export type CRMBackup = {
  schemaVersion: number;
  exportedAt: string;
  app: string;
  data: {
    contacts: Contact[];
    tasks: Task[];
    activities: Activity[];
    researchEntries: ResearchEntry[];
    projects?: Project[];
    projectVisits?: ProjectVisit[];
    creators?: Creator[];
    eisenhowerItems?: EisenhowerItem[];
    resources?: Resource[];
    outreach?: OutreachBackup;
    settings?: BackupSettings;
  };
};

type BackupInput = {
  contacts: Contact[];
  tasks: Task[];
  activities: Activity[];
  researchEntries: ResearchEntry[];
  stages: Stage[];
  researchLists: ResearchList[];
  eisenhowerItems: EisenhowerItem[];
  projects: Project[];
  projectVisits: ProjectVisit[];
  creators: Creator[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readJsonFromStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
};

const saveJsonToStorage = <T,>(key: string, value: T) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
};

const readLocalExtras = () => ({
  resources: readJsonFromStorage<Resource[]>(STORAGE_KEYS.resources, []),
  outreach: {
    leads: readJsonFromStorage<OutreachLead[]>(STORAGE_KEYS.outreachLeads, []),
    actions: readJsonFromStorage<OutreachActionLog[]>(STORAGE_KEYS.outreachActions, []),
    imports: readJsonFromStorage<OutreachImportSummary[]>(STORAGE_KEYS.outreachImports, []),
  },
});

export const buildBackup = (input: BackupInput): CRMBackup => {
  const extras = readLocalExtras();
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: "solo-crm",
    data: {
      contacts: input.contacts,
      tasks: input.tasks,
      activities: input.activities,
      researchEntries: input.researchEntries,
      projects: input.projects,
      projectVisits: input.projectVisits,
      creators: input.creators,
      eisenhowerItems: input.eisenhowerItems,
      resources: extras.resources,
      outreach: extras.outreach,
      settings: {
        stages: input.stages,
        researchLists: input.researchLists,
      },
    },
  };
};

export const validateBackup = (
  value: unknown,
): { ok: true; data: CRMBackup } | { ok: false; error: string } => {
  if (!isRecord(value)) {
    return { ok: false, error: "Backup file is not a valid JSON object." };
  }

  if (value.schemaVersion !== 1) {
    return { ok: false, error: "Unsupported backup version." };
  }

  if (value.app !== "solo-crm") {
    return { ok: false, error: "This backup file is not for this app." };
  }

  if (typeof value.exportedAt !== "string") {
    return { ok: false, error: "Backup metadata is missing or invalid." };
  }

  if (!isRecord(value.data)) {
    return { ok: false, error: "Backup data section is missing." };
  }

  const data = value.data as Record<string, unknown>;

  if (!Array.isArray(data.contacts)) {
    return { ok: false, error: "Contacts data is missing or invalid." };
  }
  if (!Array.isArray(data.tasks)) {
    return { ok: false, error: "Tasks data is missing or invalid." };
  }
  if (!Array.isArray(data.activities)) {
    return { ok: false, error: "Activities data is missing or invalid." };
  }
  if (!Array.isArray(data.researchEntries)) {
    return { ok: false, error: "Research entries data is missing or invalid." };
  }
  if (data.projects !== undefined && !Array.isArray(data.projects)) {
    return { ok: false, error: "Projects data is invalid." };
  }
  if (data.projectVisits !== undefined && !Array.isArray(data.projectVisits)) {
    return { ok: false, error: "Project visits data is invalid." };
  }
  if (data.creators !== undefined && !Array.isArray(data.creators)) {
    return { ok: false, error: "Creators data is invalid." };
  }

  if (data.eisenhowerItems !== undefined && !Array.isArray(data.eisenhowerItems)) {
    return { ok: false, error: "Eisenhower items data is invalid." };
  }
  if (data.resources !== undefined && !Array.isArray(data.resources)) {
    return { ok: false, error: "Resources data is invalid." };
  }

  if (data.outreach !== undefined) {
    if (!isRecord(data.outreach)) {
      return { ok: false, error: "Outreach data is invalid." };
    }
    const outreach = data.outreach as Record<string, unknown>;
    if (outreach.leads !== undefined && !Array.isArray(outreach.leads)) {
      return { ok: false, error: "Outreach leads data is invalid." };
    }
    if (outreach.actions !== undefined && !Array.isArray(outreach.actions)) {
      return { ok: false, error: "Outreach actions data is invalid." };
    }
    if (outreach.imports !== undefined && !Array.isArray(outreach.imports)) {
      return { ok: false, error: "Outreach imports data is invalid." };
    }
  }

  if (data.settings !== undefined) {
    if (!isRecord(data.settings)) {
      return { ok: false, error: "Settings data is invalid." };
    }
    const settings = data.settings as Record<string, unknown>;
    if (settings.stages !== undefined && !Array.isArray(settings.stages)) {
      return { ok: false, error: "Stages data is invalid." };
    }
    if (settings.researchLists !== undefined && !Array.isArray(settings.researchLists)) {
      return { ok: false, error: "Research lists data is invalid." };
    }
  }

  return { ok: true, data: value as CRMBackup };
};

export const applyBackup = (
  backup: CRMBackup,
  options: { preserveMissingExtras?: boolean } = {},
): { ok: true } | { ok: false; error: string } => {
  const preserveMissingExtras = options.preserveMissingExtras ?? true;
  const settings = backup.data.settings ?? {};
  const stagesToUse = settings.stages ?? DEFAULT_STAGES;
  const researchListsToUse = settings.researchLists ?? [];
  const existingEisenhower = readJsonFromStorage<EisenhowerItem[]>(STORAGE_KEYS.eisenhowerItems, []);
  const existingProjects = readJsonFromStorage<Project[]>(STORAGE_KEYS.projects, []);
  const existingProjectVisits = readJsonFromStorage<ProjectVisit[]>(STORAGE_KEYS.projectVisits, []);
  const existingCreators = readJsonFromStorage<Creator[]>(STORAGE_KEYS.creators, []);
  const existingResources = readJsonFromStorage<Resource[]>(STORAGE_KEYS.resources, []);
  const existingOutreachLeads = readJsonFromStorage<OutreachLead[]>(STORAGE_KEYS.outreachLeads, []);
  const existingOutreachActions = readJsonFromStorage<OutreachActionLog[]>(STORAGE_KEYS.outreachActions, []);
  const existingOutreachImports = readJsonFromStorage<OutreachImportSummary[]>(STORAGE_KEYS.outreachImports, []);

  const eisenhowerItemsToUse =
    backup.data.eisenhowerItems ?? (preserveMissingExtras ? existingEisenhower : []);
  const projectsToUse = backup.data.projects ?? (preserveMissingExtras ? existingProjects : []);
  const projectVisitsToUse =
    backup.data.projectVisits ?? (preserveMissingExtras ? existingProjectVisits : []);
  const creatorsToUse = backup.data.creators ?? (preserveMissingExtras ? existingCreators : []);
  const resourcesToUse = backup.data.resources ?? (preserveMissingExtras ? existingResources : []);
  const outreach = backup.data.outreach ?? {};
  const outreachLeadsToUse = outreach.leads ?? (preserveMissingExtras ? existingOutreachLeads : []);
  const outreachActionsToUse = outreach.actions ?? (preserveMissingExtras ? existingOutreachActions : []);
  const outreachImportsToUse = outreach.imports ?? (preserveMissingExtras ? existingOutreachImports : []);

  try {
    saveJsonToStorage(STORAGE_KEYS.contacts, backup.data.contacts);
    saveJsonToStorage(STORAGE_KEYS.tasks, backup.data.tasks);
    saveJsonToStorage(STORAGE_KEYS.activities, backup.data.activities);
    saveJsonToStorage(STORAGE_KEYS.researchEntries, backup.data.researchEntries);
    saveJsonToStorage(STORAGE_KEYS.projects, projectsToUse);
    saveJsonToStorage(STORAGE_KEYS.projectVisits, projectVisitsToUse);
    saveJsonToStorage(STORAGE_KEYS.creators, creatorsToUse);
    saveJsonToStorage(STORAGE_KEYS.stages, stagesToUse);
    saveJsonToStorage(STORAGE_KEYS.researchLists, researchListsToUse);
    saveJsonToStorage(STORAGE_KEYS.eisenhowerItems, eisenhowerItemsToUse);
    saveJsonToStorage(STORAGE_KEYS.resources, resourcesToUse);
    saveJsonToStorage(STORAGE_KEYS.outreachLeads, outreachLeadsToUse);
    saveJsonToStorage(STORAGE_KEYS.outreachActions, outreachActionsToUse);
    saveJsonToStorage(STORAGE_KEYS.outreachImports, outreachImportsToUse);
    return { ok: true };
  } catch {
    return { ok: false, error: "Import failed. Please try again with a valid backup file." };
  }
};
