export type ResourceType = "email" | "dm" | "link" | "snippet";

type BaseResource = {
  id: string;
  type: ResourceType;
  title: string;
  tags?: string[];
  starred?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type EmailResource = BaseResource & {
  type: "email";
  subject: string;
  body: string;
};

export type DmResource = BaseResource & {
  type: "dm";
  body: string;
};

export type SnippetResource = BaseResource & {
  type: "snippet";
  body: string;
};

export type LinkResource = BaseResource & {
  type: "link";
  url: string;
  notes?: string;
};

export type Resource = EmailResource | DmResource | SnippetResource | LinkResource;

const STORAGE_KEY = "simplecrm_resources_v1";

const getStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

const safeParse = (raw: string | null): Resource[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Resource[];
  } catch {
    return [];
  }
};

const saveResources = (resources: Resource[]) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(resources));
};

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const listResources = (): Resource[] => {
  const storage = getStorage();
  if (!storage) return [];
  const resources = safeParse(storage.getItem(STORAGE_KEY));
  return [...resources].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const createResource = (
  data: Omit<Resource, "id" | "createdAt" | "updatedAt">
): Resource => {
  const now = Date.now();
  const resource: Resource = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  const resources = listResources();
  const next = [resource, ...resources];
  saveResources(next);
  return resource;
};

export const updateResource = (
  id: string,
  changes: Partial<Resource>
): Resource | null => {
  const resources = listResources();
  const index = resources.findIndex((resource) => resource.id === id);
  if (index === -1) return null;
  const existing = resources[index];
  const updated: Resource = {
    ...existing,
    ...changes,
    id: existing.id,
    type: existing.type,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  const next = [...resources];
  next[index] = updated;
  saveResources(next);
  return updated;
};

export const deleteResource = (id: string) => {
  const resources = listResources();
  const next = resources.filter((resource) => resource.id !== id);
  saveResources(next);
};

export const duplicateResource = (id: string): Resource | null => {
  const resources = listResources();
  const source = resources.find((resource) => resource.id === id);
  if (!source) return null;
  const now = Date.now();
  const copy: Resource = {
    ...source,
    id: generateId(),
    title: `${source.title} (Copy)`,
    createdAt: now,
    updatedAt: now,
    starred: false,
  };
  const next = [copy, ...resources];
  saveResources(next);
  return copy;
};
