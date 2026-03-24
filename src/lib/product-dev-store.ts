export type UserType = "B2B" | "B2C" | "Admin" | "Multi";
export type MoscowTier = "Must" | "Should" | "Could" | "Won't";
export type RoadmapLane = "Now" | "Next" | "Later";
export type IdeaStatus = "active" | "done" | "archived";

export type ProductIdea = {
  id: string;
  title: string;
  value: string;
  userType: UserType;
  moscow: MoscowTier;
  roadmap: RoadmapLane;
  status: IdeaStatus;
  impact: number;
  confidence: number;
  effort: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "simplecrm_product_dev_v1";

const getStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

const safeParse = (raw: string | null): ProductIdea[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ProductIdea[];
  } catch {
    return [];
  }
};

const saveIdeas = (ideas: ProductIdea[]) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(ideas));
};

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idea_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const listIdeas = (): ProductIdea[] => {
  const storage = getStorage();
  if (!storage) return [];
  const ideas = safeParse(storage.getItem(STORAGE_KEY)).map((idea) => ({
    ...idea,
    status: (idea as ProductIdea).status ?? "active",
  }));
  return [...ideas].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const createIdea = (
  data: Omit<ProductIdea, "id" | "createdAt" | "updatedAt">
): ProductIdea => {
  const now = Date.now();
  const idea: ProductIdea = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  const ideas = listIdeas();
  const next = [idea, ...ideas];
  saveIdeas(next);
  return idea;
};

export const updateIdea = (
  id: string,
  changes: Partial<ProductIdea>
): ProductIdea | null => {
  const ideas = listIdeas();
  const index = ideas.findIndex((idea) => idea.id === id);
  if (index === -1) return null;
  const existing = ideas[index];
  const updated: ProductIdea = {
    ...existing,
    ...changes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  const next = [...ideas];
  next[index] = updated;
  saveIdeas(next);
  return updated;
};

export const deleteIdea = (id: string) => {
  const ideas = listIdeas();
  const next = ideas.filter((idea) => idea.id !== id);
  saveIdeas(next);
};
