import { OUTREACH_LAST_CHANGE_KEY } from "@/lib/backup";

export type PivotStatus = "Explore" | "Validate" | "Decide" | "Parked";

export type PivotIdea = {
  id: string;
  title: string;
  summary: string;
  changeSummary: string;
  pros: string;
  risks: string;
  unknowns: string;
  desirability: number;
  feasibility: number;
  viability: number;
  status: PivotStatus;
  nextStep: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
};

export type CurrentModel = {
  name: string;
  summary: string;
  targetCustomer: string;
  channels: string;
  costStructure: string;
  keyAssumptions: string;
  notes: string;
  targetGrossProfit: number;
};

export type CpmStream = {
  videosPerMonth: number;
  billableViewsPerVideo: number;
  cpmMin: number;
  cpmMax: number;
  platformTakeRate: number;
  capPerVideoTotal: number;
  capHitRate: number;
  notes: string;
};

export type CpmScenario = CpmStream & {
  id: string;
  name: string;
  includeInCompare: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AdditionalStream = {
  id: string;
  name: string;
  unitLabel: string;
  pricePerUnit: number;
  creatorPayoutPerUnit: number;
  unitsPerMonth: number;
  notes: string;
  includeInCompare: boolean;
  createdAt: number;
  updatedAt: number;
};

export type BusinessModelState = {
  current: CurrentModel;
  cpm: CpmStream;
  cpmAlternatives: CpmScenario[];
  additionalStreams: AdditionalStream[];
  pivotIdeas: PivotIdea[];
  updatedAt: number;
};

const STORAGE_KEY = "simplecrm_business_model_v1";

const DEFAULT_CURRENT: CurrentModel = {
  name: "",
  summary: "",
  targetCustomer: "",
  channels: "",
  costStructure: "",
  keyAssumptions: "",
  notes: "",
  targetGrossProfit: 0,
};

const DEFAULT_CPM: CpmStream = {
  videosPerMonth: 0,
  billableViewsPerVideo: 0,
  cpmMin: 3,
  cpmMax: 7.5,
  platformTakeRate: 25,
  capPerVideoTotal: 240,
  capHitRate: 0,
  notes: "",
};

const getStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

const safeParse = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BusinessModelState & { revenueStreams?: unknown };
  } catch {
    return null;
  }
};

const normalizeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
};

const normalizeText = (value: unknown) => (typeof value === "string" ? value : "");

const normalizeBoolean = (value: unknown) => (typeof value === "boolean" ? value : false);

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `bm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeCurrent = (value: Partial<CurrentModel> | null | undefined): CurrentModel => ({
  ...DEFAULT_CURRENT,
  name: normalizeText(value?.name),
  summary: normalizeText(value?.summary),
  targetCustomer: normalizeText(value?.targetCustomer),
  channels: normalizeText(value?.channels),
  costStructure: normalizeText(value?.costStructure),
  keyAssumptions: normalizeText(value?.keyAssumptions),
  notes: normalizeText(value?.notes),
  targetGrossProfit: normalizeNumber(value?.targetGrossProfit),
});

const normalizeCpm = (value: Partial<CpmStream> | null | undefined): CpmStream => ({
  ...DEFAULT_CPM,
  videosPerMonth: normalizeNumber(value?.videosPerMonth),
  billableViewsPerVideo: normalizeNumber(value?.billableViewsPerVideo),
  cpmMin: normalizeNumber(value?.cpmMin) || DEFAULT_CPM.cpmMin,
  cpmMax: normalizeNumber(value?.cpmMax) || DEFAULT_CPM.cpmMax,
  platformTakeRate: normalizeNumber(value?.platformTakeRate) || DEFAULT_CPM.platformTakeRate,
  capPerVideoTotal: normalizeNumber(value?.capPerVideoTotal) || DEFAULT_CPM.capPerVideoTotal,
  capHitRate: normalizeNumber(value?.capHitRate),
  notes: normalizeText(value?.notes),
});

const normalizeCpmScenario = (
  value: Partial<CpmScenario> | null | undefined,
): CpmScenario => {
  const createdAt = normalizeNumber(value?.createdAt) || Date.now();
  return {
    id: normalizeText(value?.id) || generateId(),
    name: normalizeText(value?.name) || "Alternative",
    includeInCompare: normalizeBoolean(value?.includeInCompare),
    createdAt,
    updatedAt: normalizeNumber(value?.updatedAt) || createdAt,
    ...normalizeCpm(value),
  };
};

const normalizeAdditionalStream = (
  value: Partial<AdditionalStream> | null | undefined,
): AdditionalStream => {
  const createdAt = normalizeNumber(value?.createdAt) || Date.now();
  return {
    id: normalizeText(value?.id) || generateId(),
    name: normalizeText(value?.name),
    unitLabel: normalizeText(value?.unitLabel) || "unit",
    pricePerUnit: normalizeNumber(value?.pricePerUnit),
    creatorPayoutPerUnit: normalizeNumber(value?.creatorPayoutPerUnit),
    unitsPerMonth: normalizeNumber(value?.unitsPerMonth),
    notes: normalizeText(value?.notes),
    includeInCompare: normalizeBoolean(value?.includeInCompare),
    createdAt,
    updatedAt: normalizeNumber(value?.updatedAt) || createdAt,
  };
};

const normalizePivot = (value: Partial<PivotIdea> | null | undefined): PivotIdea => {
  const createdAt = normalizeNumber(value?.createdAt) || Date.now();
  const status = value?.status;
  const normalizedStatus: PivotStatus =
    status === "Explore" || status === "Validate" || status === "Decide" || status === "Parked"
      ? status
      : "Explore";
  return {
    id: normalizeText(value?.id) || generateId(),
    title: normalizeText(value?.title),
    summary: normalizeText(value?.summary),
    changeSummary: normalizeText(value?.changeSummary),
    pros: normalizeText(value?.pros),
    risks: normalizeText(value?.risks),
    unknowns: normalizeText(value?.unknowns),
    desirability: normalizeNumber(value?.desirability) || 3,
    feasibility: normalizeNumber(value?.feasibility) || 3,
    viability: normalizeNumber(value?.viability) || 3,
    status: normalizedStatus,
    nextStep: normalizeText(value?.nextStep),
    notes: normalizeText(value?.notes),
    createdAt,
    updatedAt: normalizeNumber(value?.updatedAt) || createdAt,
  };
};

const mapLegacyRevenueStreams = (value: unknown): AdditionalStream[] => {
  if (!Array.isArray(value)) return [];
  return value.map((stream) => {
    const raw = stream as {
      id?: string;
      name?: string;
      price?: number;
      unitsPerMonth?: number;
      grossMargin?: number;
      notes?: string;
      createdAt?: number;
      updatedAt?: number;
    };
    const pricePerUnit = normalizeNumber(raw.price);
    const grossMargin = normalizeNumber(raw.grossMargin);
    const creatorPayoutPerUnit =
      pricePerUnit > 0 ? pricePerUnit * (1 - grossMargin / 100) : 0;
    return normalizeAdditionalStream({
      id: raw.id,
      name: raw.name,
      unitLabel: "unit",
      pricePerUnit,
      creatorPayoutPerUnit,
      unitsPerMonth: normalizeNumber(raw.unitsPerMonth),
      notes: raw.notes,
      includeInCompare: false,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  });
};

export const loadBusinessModel = (): BusinessModelState => {
  const storage = getStorage();
  if (!storage) {
    return {
      current: DEFAULT_CURRENT,
      cpm: DEFAULT_CPM,
      cpmAlternatives: [],
      additionalStreams: [],
      pivotIdeas: [],
      updatedAt: Date.now(),
    };
  }
  const parsed = safeParse(storage.getItem(STORAGE_KEY));
  if (!parsed) {
    return {
      current: DEFAULT_CURRENT,
      cpm: DEFAULT_CPM,
      cpmAlternatives: [],
      additionalStreams: [],
      pivotIdeas: [],
      updatedAt: Date.now(),
    };
  }

  const additionalStreams = Array.isArray(parsed.additionalStreams)
    ? parsed.additionalStreams.map((stream) => normalizeAdditionalStream(stream))
    : parsed.revenueStreams
    ? mapLegacyRevenueStreams(parsed.revenueStreams)
    : [];

  const pivotIdeas = Array.isArray(parsed.pivotIdeas)
    ? parsed.pivotIdeas.map((idea) => normalizePivot(idea))
    : [];

  const cpmAlternatives = Array.isArray(parsed.cpmAlternatives)
    ? parsed.cpmAlternatives.map((scenario) => normalizeCpmScenario(scenario))
    : [];

  return {
    current: normalizeCurrent(parsed.current),
    cpm: normalizeCpm((parsed as { cpm?: Partial<CpmStream> }).cpm),
    cpmAlternatives,
    additionalStreams,
    pivotIdeas,
    updatedAt: normalizeNumber(parsed.updatedAt) || Date.now(),
  };
};

export const saveBusinessModel = (state: BusinessModelState) => {
  const storage = getStorage();
  if (!storage) return;
  const serialized = JSON.stringify(state);
  const previous = storage.getItem(STORAGE_KEY);
  if (previous === serialized) return;
  storage.setItem(STORAGE_KEY, serialized);
  // Seeding defaults isn't an edit; marking it would block pulling real data from the cloud.
  if (previous === null) return;
  // Marks a local edit so cloud sync doesn't pull an older copy over it.
  try {
    storage.setItem(OUTREACH_LAST_CHANGE_KEY, new Date().toISOString());
  } catch {
    // ignore storage errors
  }
};

export const createAdditionalStream = (): AdditionalStream => ({
  id: generateId(),
  name: "",
  unitLabel: "unit",
  pricePerUnit: 0,
  creatorPayoutPerUnit: 0,
  unitsPerMonth: 0,
  notes: "",
  includeInCompare: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const createCpmAlternative = (base?: CpmStream): CpmScenario => {
  const now = Date.now();
  return {
    id: generateId(),
    name: "Alternative",
    includeInCompare: true,
    createdAt: now,
    updatedAt: now,
    ...(base ? normalizeCpm(base) : DEFAULT_CPM),
  };
};

export const createPivotIdea = (): PivotIdea => ({
  id: generateId(),
  title: "",
  summary: "",
  changeSummary: "",
  pros: "",
  risks: "",
  unknowns: "",
  desirability: 3,
  feasibility: 3,
  viability: 3,
  status: "Explore",
  nextStep: "",
  notes: "",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
