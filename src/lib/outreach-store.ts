import { addDays } from "date-fns";
import {
  OUTREACH_ACTIONS,
  OUTREACH_FINAL_STATUSES,
  OUTREACH_STATUSES,
  OutreachActionLog,
  OutreachActionType,
  OutreachBucket,
  OutreachCadenceTrack,
  OutreachChannel,
  OutreachImportSummary,
  OutreachLead,
  OutreachStatus,
} from "@/types/outreach";
import { OUTREACH_LAST_CHANGE_KEY } from "@/lib/backup";

const STORAGE_KEYS = {
  leads: "simplecrm_outreach_leads_v1",
  actions: "simplecrm_outreach_actions_v1",
  imports: "simplecrm_outreach_imports_v1",
};

const DEFAULT_SOURCE = "csv_import";

const KEYWORD_BOOSTS = [
  "escape room",
  "escape",
  "minigolf",
  "mini golf",
  "laser tag",
  "bowling",
  "arcade",
];

const TYPE_BOOSTS = ["tourist_attraction", "amusement", "amusement_park", "point_of_interest"];

const TARGET_CITIES: string[] = [];

const SCORE_WEIGHTS = {
  phone: 30,
  website: 20,
  keyword: 10,
  type: 10,
  city: 10,
  maps: 5,
};

const SCORE_THRESHOLDS = {
  a: 60,
  b: 40,
};

const getStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const saveToStorage = <T>(key: string, value: T) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
};

const touchOutreachChange = () => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(OUTREACH_LAST_CHANGE_KEY, new Date().toISOString());
  } catch {
    // ignore storage errors
  }
};

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `out_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const isGoogleMapsUrl = (value: string) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.hostname.includes("google.") && url.pathname.startsWith("/maps");
  } catch {
    return value.toLowerCase().includes("google.") && value.toLowerCase().includes("/maps");
  }
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const normalizedBase = `${url.protocol}//${url.host}${url.pathname}`.replace(/\/$/, "").toLowerCase();
    if (url.hostname.includes("google.") && url.pathname.startsWith("/maps")) {
      const search = url.search ? url.search.toLowerCase() : "";
      return `${normalizedBase}${search}`;
    }
    return normalizedBase;
  } catch {
    return trimmed.replace(/\/$/, "").toLowerCase();
  }
};

const normalizePhone = (value: string): string | null => {
  const raw = value.trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) {
    const cleaned = `+${digits}`;
    return cleaned.length >= 9 && cleaned.length <= 16 ? cleaned : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
};

const parseList = (value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/[,|;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeBucket = (value: string): OutreachBucket | null => {
  const normalized = value.trim().toUpperCase();
  if (normalized === "A" || normalized === "B" || normalized === "C") return normalized;
  return null;
};

const normalizeChannel = (value: string): OutreachChannel | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.includes("whatsapp")) return "whatsapp";
  if (normalized.includes("call") || normalized.includes("phone")) return "call";
  if (normalized.includes("email")) return "email";
  if (normalized.includes("form")) return "form";
  if (normalized.includes("instagram") || normalized.includes("ig")) return "ig";
  if (normalized.includes("walk")) return "walkin";
  return null;
};

const deriveBestChannel = (lead: Pick<OutreachLead, "phoneE164" | "websiteUrl">): OutreachChannel => {
  if (lead.phoneE164) return "call";
  if (lead.websiteUrl) return "form";
  return "email";
};

const containsAny = (haystack: string[], needles: string[]) => {
  const set = new Set(haystack.map((item) => normalizeText(item)));
  return needles.some((needle) => set.has(normalizeText(needle)));
};

const computeScore = (lead: Pick<OutreachLead, "phoneE164" | "websiteUrl" | "googleMapsUrl" | "types" | "keywordsFoundBy" | "city">) => {
  let score = 0;
  if (lead.phoneE164) score += SCORE_WEIGHTS.phone;
  if (lead.websiteUrl) score += SCORE_WEIGHTS.website;
  if (lead.googleMapsUrl) score += SCORE_WEIGHTS.maps;
  if (containsAny(lead.keywordsFoundBy, KEYWORD_BOOSTS)) score += SCORE_WEIGHTS.keyword;
  if (containsAny(lead.types, TYPE_BOOSTS)) score += SCORE_WEIGHTS.type;
  if (TARGET_CITIES.some((city) => normalizeText(city) === normalizeText(lead.city))) {
    score += SCORE_WEIGHTS.city;
  }
  return score;
};

const bucketFromScore = (score: number): OutreachBucket => {
  if (score >= SCORE_THRESHOLDS.a) return "A";
  if (score >= SCORE_THRESHOLDS.b) return "B";
  return "C";
};

const isFinalStatus = (status: OutreachStatus) => OUTREACH_FINAL_STATUSES.includes(status);

const isValidStatus = (value: string): value is OutreachStatus =>
  OUTREACH_STATUSES.includes(value as OutreachStatus);

const isValidAction = (value: string): value is OutreachActionType =>
  OUTREACH_ACTIONS.includes(value as OutreachActionType);

const getCadenceSteps = (lead: Pick<OutreachLead, "cadenceTrack" | "websiteUrl" | "bestChannel">) => {
  if (lead.cadenceTrack === "phone") {
    return [
      { action: "Called" as OutreachActionType, delayDays: 0 },
      { action: "Called" as OutreachActionType, delayDays: 2 },
      { action: "Called" as OutreachActionType, delayDays: 3 },
      { action: "Called" as OutreachActionType, delayDays: 5 },
    ];
  }

  const firstAction: OutreachActionType = lead.websiteUrl ? "Submitted contact form" : "Sent email";
  const followUpAction: OutreachActionType = lead.websiteUrl ? "Submitted contact form" : "Sent email";
  const lateAction: OutreachActionType = lead.bestChannel === "walkin" ? "Walk-in" : "IG DM sent";

  return [
    { action: firstAction, delayDays: 0 },
    { action: followUpAction, delayDays: 3 },
    { action: lateAction, delayDays: 4 },
    { action: lateAction, delayDays: 3 },
  ];
};

const scheduleNextAction = (
  lead: Pick<OutreachLead, "cadenceTrack" | "websiteUrl" | "bestChannel">,
  step: number,
) => {
  const steps = getCadenceSteps(lead);
  const next = steps[step];
  if (!next) return null;
  return {
    action: next.action,
    at: addDays(new Date(), next.delayDays).toISOString(),
    step,
  };
};

const getLeads = (): OutreachLead[] => {
  const storage = getStorage();
  if (!storage) return [];
  return safeParse(storage.getItem(STORAGE_KEYS.leads), [] as OutreachLead[]);
};

const saveLeads = (leads: OutreachLead[]) => {
  saveToStorage(STORAGE_KEYS.leads, leads);
  touchOutreachChange();
};

const getActions = (): OutreachActionLog[] => {
  const storage = getStorage();
  if (!storage) return [];
  return safeParse(storage.getItem(STORAGE_KEYS.actions), [] as OutreachActionLog[]);
};

const saveActions = (actions: OutreachActionLog[]) => {
  saveToStorage(STORAGE_KEYS.actions, actions);
  touchOutreachChange();
};

const getImports = (): OutreachImportSummary[] => {
  const storage = getStorage();
  if (!storage) return [];
  return safeParse(storage.getItem(STORAGE_KEYS.imports), [] as OutreachImportSummary[]);
};

const saveImports = (imports: OutreachImportSummary[]) => {
  saveToStorage(STORAGE_KEYS.imports, imports);
  touchOutreachChange();
};

export const listOutreachLeads = (): OutreachLead[] => {
  return [...getLeads()].sort((a, b) => {
    const aNext = a.nextActionAt ? new Date(a.nextActionAt).getTime() : Number.POSITIVE_INFINITY;
    const bNext = b.nextActionAt ? new Date(b.nextActionAt).getTime() : Number.POSITIVE_INFINITY;
    if (aNext !== bNext) return aNext - bNext;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
};

export const listOutreachActions = (leadId?: string): OutreachActionLog[] => {
  const actions = getActions();
  const filtered = leadId ? actions.filter((action) => action.leadId === leadId) : actions;
  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const listOutreachImports = (): OutreachImportSummary[] => {
  return [...getImports()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const createOutreachLead = (
  data: Omit<OutreachLead, "id" | "createdAt" | "updatedAt">
): OutreachLead => {
  const now = new Date().toISOString();
  const lead: OutreachLead = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  const leads = getLeads();
  leads.push(lead);
  saveLeads(leads);
  return lead;
};

export const updateOutreachLead = (id: string, changes: Partial<OutreachLead>): OutreachLead | null => {
  const leads = getLeads();
  const index = leads.findIndex((lead) => lead.id === id);
  if (index === -1) return null;
  const existing = leads[index];
  const updated: OutreachLead = {
    ...existing,
    ...changes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  leads[index] = updated;
  saveLeads(leads);
  return updated;
};

export const deleteOutreachLead = (id: string) => {
  const leads = getLeads().filter((lead) => lead.id !== id);
  const actions = getActions().filter((action) => action.leadId !== id);
  saveLeads(leads);
  saveActions(actions);
};

export const logOutreachAction = (
  leadId: string,
  action: OutreachActionType,
  notes: string,
  status?: OutreachStatus,
): OutreachActionLog | null => {
  const leads = getLeads();
  const index = leads.findIndex((lead) => lead.id === leadId);
  if (index === -1) return null;
  const lead = leads[index];
  const now = new Date().toISOString();
  const nextStatus = status ?? lead.status;
  let nextAction: OutreachActionType | null = lead.nextAction;
  let nextActionAt: string | null = lead.nextActionAt;
  let nextStep = lead.cadenceStep;

  if (isFinalStatus(nextStatus)) {
    nextAction = null;
    nextActionAt = null;
  } else {
    const scheduled = scheduleNextAction(lead, lead.cadenceStep + 1);
    if (scheduled) {
      nextAction = scheduled.action;
      nextActionAt = scheduled.at;
      nextStep = scheduled.step;
    } else {
      nextAction = null;
      nextActionAt = null;
      nextStep = lead.cadenceStep + 1;
    }
  }

  const trimmedNotes = notes.trim();
  const updatedLead: OutreachLead = {
    ...lead,
    status: nextStatus,
    lastAction: action,
    lastActionAt: now,
    nextAction,
    nextActionAt,
    cadenceStep: nextStep,
    notes: trimmedNotes ? trimmedNotes : lead.notes,
    updatedAt: now,
  };

  leads[index] = updatedLead;
  saveLeads(leads);

  const newAction: OutreachActionLog = {
    id: generateId(),
    leadId,
    action,
    statusAfter: nextStatus,
    notes,
    createdAt: now,
  };

  const actions = getActions();
  actions.unshift(newAction);
  saveActions(actions);
  return newAction;
};

const toNumber = (value: string) => {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeHeaders = (headers: string[]) => headers.map((header) => normalizeText(header));

const findHeaderIndex = (normalizedHeaders: string[], options: string[]) => {
  const optionSet = options.map((option) => normalizeText(option));
  return normalizedHeaders.findIndex((header) => optionSet.includes(header));
};

export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === "\"" && nextChar === "\"" && inQuotes) {
      field += "\"";
      i += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      current.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      current.push(field);
      if (current.some((value) => value.trim().length > 0)) {
        rows.push(current);
      }
      current = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field);
    if (current.some((value) => value.trim().length > 0)) {
      rows.push(current);
    }
  }

  return rows;
};

export const parseCsvRecords = (text: string) => {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [] as string[], records: [] as Record<string, string>[] };
  const headers = rows[0].map((header) => header.trim());
  const normalizedHeaders = normalizeHeaders(headers);
  const records = rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index]?.trim() ?? "";
    });
    record.__normalizedHeaders = normalizedHeaders.join("|");
    return record;
  });
  return { headers, records };
};

const mapRecordToLead = (record: Record<string, string>) => {
  const headers = Object.keys(record).filter((key) => !key.startsWith("__"));
  const normalizedHeaders = normalizeHeaders(headers);

  const getValue = (options: string[]) => {
    const index = findHeaderIndex(normalizedHeaders, options);
    if (index === -1) return "";
    const header = headers[index];
    return record[header] ?? "";
  };

  const venueName = getValue(["venue_name", "venue name", "name", "business", "business_name"]);
  const city = getValue(["city", "town"]);
  const address = getValue(["address", "street", "location"]);
  const phone = getValue(["phone", "phone_raw", "phone number"]);
  const phoneInternational = getValue(["phone_international", "phone intl", "phone international"]);
  const websiteUrl = getValue(["website_url", "website", "site"]);
  const googleMapsUrl = getValue(["google_maps_url", "google maps", "maps_url", "maps"]);
  const types = parseList(getValue(["types", "categories"]));
  const keywords = parseList(getValue(["keywords_found_by", "keywords", "found_by"]));
  const priorityScoreValue = getValue(["priority_score", "score"]);
  const bucketValue = getValue(["bucket"]);
  const bestChannelValue = getValue(["best_channel", "best channel", "channel"]);

  const phoneRaw = phoneInternational || phone;
  const phoneE164 = normalizePhone(phoneInternational || phone);

  const websiteTrimmed = websiteUrl.trim();
  const mapsTrimmed = googleMapsUrl.trim();
  const websiteIsMaps = isGoogleMapsUrl(websiteTrimmed);

  return {
    venueName,
    city,
    address,
    phoneRaw,
    phoneE164,
    websiteUrl: websiteIsMaps ? "" : websiteTrimmed,
    googleMapsUrl: mapsTrimmed || (websiteIsMaps ? websiteTrimmed : ""),
    types,
    keywordsFoundBy: keywords,
    priorityScore: toNumber(priorityScoreValue),
    bucket: normalizeBucket(bucketValue),
    bestChannel: normalizeChannel(bestChannelValue),
  };
};

const findDuplicate = (leads: OutreachLead[], payload: { phoneE164: string | null; websiteUrl: string; googleMapsUrl: string; venueName: string; city: string; }) => {
  const normalizedPhone = payload.phoneE164 || "";
  const normalizedWebsite = isGoogleMapsUrl(payload.websiteUrl) ? "" : normalizeUrl(payload.websiteUrl || "");
  const normalizedMaps = normalizeUrl(payload.googleMapsUrl || "");
  if (!normalizedMaps && !normalizedPhone && !normalizedWebsite) return undefined;

  return leads.find((lead) => {
    if (normalizedMaps && normalizeUrl(lead.googleMapsUrl || "") === normalizedMaps) return true;
    if (normalizedPhone && lead.phoneE164 && lead.phoneE164 === normalizedPhone) return true;
    if (normalizedWebsite && normalizeUrl(lead.websiteUrl || "") === normalizedWebsite) return true;
    return false;
  });
};

export const importOutreachRecords = (
  records: Record<string, string>[],
  options?: { sourceId?: string; overrideScores?: boolean; fileName?: string; disableDedupe?: boolean },
) => {
  const leads = getLeads();
  let importedCount = 0;
  let dedupedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  records.forEach((record, index) => {
    const mapped = mapRecordToLead(record);

    if (!mapped.venueName) {
      skippedCount += 1;
      errors.push(`Row ${index + 2}: Missing Venue_Name`);
      return;
    }

    const existing = options?.disableDedupe ? undefined : findDuplicate(leads, mapped);

    const bestChannel = mapped.bestChannel ?? deriveBestChannel({
      phoneE164: mapped.phoneE164,
      websiteUrl: mapped.websiteUrl,
    });

    const leadDataBase = {
      venueName: mapped.venueName,
      city: mapped.city,
      address: mapped.address,
      phoneRaw: mapped.phoneRaw,
      phoneE164: mapped.phoneE164,
      websiteUrl: mapped.websiteUrl,
      googleMapsUrl: mapped.googleMapsUrl,
      types: mapped.types,
      keywordsFoundBy: mapped.keywordsFoundBy,
      bestChannel,
    };

    const computedScore = computeScore({
      phoneE164: mapped.phoneE164,
      websiteUrl: mapped.websiteUrl,
      googleMapsUrl: mapped.googleMapsUrl,
      types: mapped.types,
      keywordsFoundBy: mapped.keywordsFoundBy,
      city: mapped.city,
    });

    const shouldOverride = options?.overrideScores ?? false;
    const priorityScore = shouldOverride || mapped.priorityScore <= 0 ? computedScore : mapped.priorityScore;
    const bucket = shouldOverride || !mapped.bucket ? bucketFromScore(priorityScore) : mapped.bucket;

    const cadenceTrack: OutreachCadenceTrack = mapped.phoneE164 ? "phone" : "no_phone";
    const initialSchedule = scheduleNextAction({ cadenceTrack, websiteUrl: mapped.websiteUrl, bestChannel }, 0);

    const leadPayload: Omit<OutreachLead, "id" | "createdAt" | "updatedAt"> = {
      ...leadDataBase,
      priorityScore,
      bucket,
      status: "New",
      lastAction: null,
      lastActionAt: null,
      nextAction: initialSchedule?.action ?? null,
      nextActionAt: initialSchedule?.at ?? null,
      cadenceStep: initialSchedule?.step ?? 0,
      cadenceTrack,
      notes: "",
      source: DEFAULT_SOURCE,
      sourceId: options?.sourceId ?? null,
    };

    if (existing) {
      const merged: OutreachLead = {
        ...existing,
        venueName: existing.venueName || leadPayload.venueName,
        city: existing.city || leadPayload.city,
        address: existing.address || leadPayload.address,
        phoneRaw: existing.phoneRaw || leadPayload.phoneRaw,
        phoneE164: existing.phoneE164 || leadPayload.phoneE164,
        websiteUrl: existing.websiteUrl || leadPayload.websiteUrl,
        googleMapsUrl: existing.googleMapsUrl || leadPayload.googleMapsUrl,
        types: existing.types.length > 0 ? existing.types : leadPayload.types,
        keywordsFoundBy: existing.keywordsFoundBy.length > 0 ? existing.keywordsFoundBy : leadPayload.keywordsFoundBy,
        priorityScore: existing.priorityScore > 0 && !shouldOverride ? existing.priorityScore : leadPayload.priorityScore,
        bucket: existing.bucket && !shouldOverride ? existing.bucket : leadPayload.bucket,
        bestChannel: existing.bestChannel !== "unknown" ? existing.bestChannel : leadPayload.bestChannel,
        cadenceTrack: existing.cadenceTrack || leadPayload.cadenceTrack,
        nextAction: existing.nextAction ?? leadPayload.nextAction,
        nextActionAt: existing.nextActionAt ?? leadPayload.nextActionAt,
        cadenceStep: Number.isFinite(existing.cadenceStep) ? existing.cadenceStep : leadPayload.cadenceStep,
        source: existing.source || leadPayload.source,
        sourceId: existing.sourceId || leadPayload.sourceId,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      const indexToUpdate = leads.findIndex((lead) => lead.id === existing.id);
      if (indexToUpdate !== -1) {
        leads[indexToUpdate] = merged;
      }
      dedupedCount += 1;
    } else {
      const created = {
        ...leadPayload,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      leads.push(created);
      importedCount += 1;
    }
  });

  saveLeads(leads);

  const summary: OutreachImportSummary = {
    id: generateId(),
    fileName: options?.fileName ?? "import.csv",
    createdAt: new Date().toISOString(),
    totalRows: records.length,
    importedCount,
    skippedCount,
    dedupedCount,
    errors,
  };

  const imports = getImports();
  imports.unshift(summary);
  saveImports(imports);

  return summary;
};

export const importOutreachCsv = (csvText: string, options?: { sourceId?: string; overrideScores?: boolean; fileName?: string; disableDedupe?: boolean }) => {
  const { records } = parseCsvRecords(csvText);
  return importOutreachRecords(records, options);
};

export const updateOutreachStatus = (leadId: string, status: OutreachStatus) => {
  const leads = getLeads();
  const index = leads.findIndex((lead) => lead.id === leadId);
  if (index === -1) return null;
  const lead = leads[index];
  const now = new Date().toISOString();
  let nextAction = lead.nextAction;
  let nextActionAt = lead.nextActionAt;

  if (isFinalStatus(status)) {
    nextAction = null;
    nextActionAt = null;
  }

  const updated: OutreachLead = {
    ...lead,
    status,
    nextAction,
    nextActionAt,
    updatedAt: now,
  };
  leads[index] = updated;
  saveLeads(leads);
  return updated;
};

export const updateOutreachNotes = (leadId: string, notes: string) => {
  return updateOutreachLead(leadId, { notes });
};

export const normalizeOutreachAction = (value: string): OutreachActionType | null => {
  const trimmed = value.trim();
  return isValidAction(trimmed) ? (trimmed as OutreachActionType) : null;
};

export const normalizeOutreachStatus = (value: string): OutreachStatus | null => {
  const trimmed = value.trim();
  return isValidStatus(trimmed) ? (trimmed as OutreachStatus) : null;
};

export const buildWhatsAppLink = (phoneE164: string, text: string) => {
  const normalized = phoneE164.replace(/\D/g, "");
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${normalized}?text=${encoded}`;
};
