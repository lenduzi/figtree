import { supabase } from "@/lib/supabase";
import type {
  Activity,
  ActivityType,
  Company,
  CompanyType,
  Contact,
  FitGrade,
  Lifecycle,
  Stage,
  Task,
} from "@/types/crm";
import type {
  OutreachActionLog,
  OutreachActionType,
  OutreachBucket,
  OutreachCadenceTrack,
  OutreachChannel,
  OutreachImportSummary,
  OutreachLead,
  OutreachStatus,
} from "@/types/outreach";

// Supabase tables are the source of truth for core CRM data. The app keeps its
// in-memory state and mutation code; each table sync diffs the current items
// against the last-saved snapshot and writes only what changed. All writes go
// through one serial queue so inserts land in dependency order (a contact
// before its task, a lead before its action).

type Row = Record<string, unknown>;

const PAGE_SIZE = 1000;
const UPSERT_CHUNK = 500;

let currentUserId: string | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let pendingWrites = 0;
let writeErrorHandler: ((error: unknown) => void) | null = null;

export const setSyncUser = (userId: string | null) => {
  currentUserId = userId;
};

export const setWriteErrorHandler = (handler: ((error: unknown) => void) | null) => {
  writeErrorHandler = handler;
};

export const hasPendingWrites = () => pendingWrites > 0;

export const waitForWrites = () => writeQueue;

const getClient = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};

const enqueueWrite = (write: () => PromiseLike<{ error: unknown }>) => {
  pendingWrites += 1;
  writeQueue = writeQueue
    .then(async () => {
      const { error } = await write();
      if (error) throw error;
    })
    .catch((error) => {
      console.error("Figtree: failed to save change", error);
      writeErrorHandler?.(error);
    })
    .finally(() => {
      pendingWrites -= 1;
    });
};

export const fetchAll = async (table: string, orderBy: string): Promise<Row[]> => {
  const client = getClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
};

export type TableSync<T> = {
  /** Records items as already saved (e.g. right after loading them). */
  reset: (items: T[]) => void;
  /** Saves whatever changed since the last reset/sync. */
  sync: (items: T[]) => void;
};

export const createTableSync = <T>(options: {
  table: string;
  keyOf: (item: T) => string;
  toRow: (item: T) => Row;
  onConflict?: string;
}): TableSync<T> => {
  let snapshot = new Map<string, string>();

  const serialize = (items: T[]) =>
    new Map(items.map((item) => [options.keyOf(item), JSON.stringify(options.toRow(item))]));

  return {
    reset: (items) => {
      snapshot = serialize(items);
    },
    sync: (items) => {
      const next = serialize(items);
      const changed: Row[] = [];
      next.forEach((json, key) => {
        if (snapshot.get(key) !== json) changed.push(JSON.parse(json) as Row);
      });
      const removed = [...snapshot.keys()].filter((key) => !next.has(key));
      snapshot = next;
      if (changed.length === 0 && removed.length === 0) return;

      const userId = currentUserId;
      if (!userId) {
        writeErrorHandler?.(new Error("Not signed in"));
        return;
      }
      const client = getClient();
      for (let i = 0; i < changed.length; i += UPSERT_CHUNK) {
        const chunk = changed.slice(i, i + UPSERT_CHUNK).map((row) => ({ ...row, user_id: userId }));
        enqueueWrite(() => client.from(options.table).upsert(chunk, { onConflict: options.onConflict }));
      }
      if (removed.length > 0) {
        // RLS limits deletes to the signed-in user's rows.
        enqueueWrite(() => client.from(options.table).delete().in("id", removed));
      }
    },
  };
};

export const importBackupIntoTables = async (payload?: unknown) => {
  const { data, error } = await getClient().rpc("import_crm_backup", payload ? { payload } : {});
  if (error) throw error;
  return data as { imported: boolean; reason?: string } & Record<string, unknown>;
};

// Row mappers -------------------------------------------------------------------

const str = (value: unknown) => (typeof value === "string" ? value : "");
const optStr = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);
const nullableStr = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
const num = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);
const strArray = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

export const stageFromRow = (row: Row): Stage => ({
  id: str(row.id),
  name: str(row.name),
  color: str(row.color),
  order: num(row.sort_order),
});

export const stageToRow = (stage: Stage): Row => ({
  id: stage.id,
  name: stage.name,
  color: stage.color,
  sort_order: stage.order,
});

const nullableNum = (value: unknown) => (value === null || value === undefined ? null : num(value));

export const companyFromRow = (row: Row): Company => ({
  id: str(row.id),
  name: str(row.name),
  type: (str(row.type) || "other") as CompanyType,
  industry: str(row.industry),
  city: str(row.city),
  address: str(row.address),
  website: str(row.website),
  phone: str(row.phone),
  email: str(row.email),
  instagram: str(row.instagram),
  googleMapsUrl: str(row.google_maps_url),
  lifecycle: (str(row.lifecycle) || "sourced") as Lifecycle,
  lifecycleChangedAt: str(row.lifecycle_changed_at),
  fit: nullableStr(row.fit) as FitGrade | null,
  fitScore: nullableNum(row.fit_score),
  fitReason: str(row.fit_reason),
  lists: strArray(row.lists),
  source: str(row.source),
  notes: str(row.notes),
  lostReason: str(row.lost_reason),
  revisitOn: nullableStr(row.revisit_on),
  nextAction: nullableStr(row.next_action),
  nextActionAt: nullableStr(row.next_action_at),
  cadenceStep: num(row.cadence_step),
  lastActivityAt: nullableStr(row.last_activity_at),
  createdAt: str(row.created_at),
  updatedAt: str(row.updated_at),
});

// lifecycle_changed_at and last_activity_at are maintained by triggers.
export const companyToRow = (company: Company): Row => ({
  id: company.id,
  name: company.name ?? "",
  type: company.type,
  industry: company.industry ?? "",
  city: company.city ?? "",
  address: company.address ?? "",
  website: company.website ?? "",
  phone: company.phone ?? "",
  email: company.email ?? "",
  instagram: company.instagram ?? "",
  google_maps_url: company.googleMapsUrl ?? "",
  lifecycle: company.lifecycle,
  fit: company.fit,
  fit_score: company.fitScore,
  fit_reason: company.fitReason ?? "",
  lists: company.lists ?? [],
  source: company.source ?? "",
  notes: company.notes ?? "",
  lost_reason: company.lostReason ?? "",
  revisit_on: company.revisitOn || null,
  next_action: company.nextAction,
  next_action_at: company.nextActionAt,
  cadence_step: company.cadenceStep ?? 0,
  created_at: company.createdAt,
});

export const contactFromRow = (row: Row): Contact => ({
  id: str(row.id),
  companyId: nullableStr(row.company_id),
  fullName: str(row.full_name),
  role: str(row.role),
  company: str(row.company),
  website: str(row.website),
  email: str(row.email),
  phone: str(row.phone),
  stageId: str(row.stage_id),
  notes: str(row.notes),
  notesLastEdited: optStr(row.notes_last_edited),
  lastInteractionDate: optStr(row.last_interaction_at),
  createdAt: str(row.created_at),
  updatedAt: str(row.updated_at),
});

export const contactToRow = (contact: Contact): Row => ({
  id: contact.id,
  company_id: contact.companyId || null,
  full_name: contact.fullName ?? "",
  role: contact.role ?? "",
  company: contact.company ?? "",
  website: contact.website ?? "",
  email: contact.email ?? "",
  phone: contact.phone ?? "",
  stage_id: contact.stageId,
  notes: contact.notes ?? "",
  notes_last_edited: contact.notesLastEdited || null,
  last_interaction_at: contact.lastInteractionDate || null,
  created_at: contact.createdAt,
  updated_at: contact.updatedAt,
});

export const taskFromRow = (row: Row): Task => ({
  id: str(row.id),
  contactId: nullableStr(row.contact_id),
  companyId: nullableStr(row.company_id),
  title: str(row.title),
  description: str(row.description),
  dueDate: str(row.due_date),
  // Postgres returns "HH:MM:SS"; the app works with "HH:MM".
  dueTime: optStr(row.due_time)?.slice(0, 5),
  hasReminder: Boolean(row.has_reminder),
  completed: Boolean(row.completed),
  createdAt: str(row.created_at),
});

export const taskToRow = (task: Task): Row => ({
  id: task.id,
  contact_id: task.contactId || null,
  company_id: task.companyId || null,
  title: task.title ?? "",
  description: task.description ?? "",
  due_date: task.dueDate,
  due_time: task.dueTime || null,
  has_reminder: task.hasReminder,
  completed: task.completed,
  created_at: task.createdAt,
});

export const activityFromRow = (row: Row): Activity => ({
  id: str(row.id),
  contactId: nullableStr(row.contact_id),
  companyId: nullableStr(row.company_id),
  type: str(row.type) as ActivityType,
  description: str(row.description),
  timestamp: str(row.occurred_at),
});

export const activityToRow = (activity: Activity): Row => ({
  id: activity.id,
  contact_id: activity.contactId || null,
  company_id: activity.companyId || null,
  type: activity.type,
  description: activity.description ?? "",
  occurred_at: activity.timestamp,
});

export const outreachLeadFromRow = (row: Row): OutreachLead => ({
  id: str(row.id),
  venueName: str(row.venue_name),
  city: str(row.city),
  address: str(row.address),
  phoneRaw: str(row.phone_raw),
  phoneE164: nullableStr(row.phone_e164),
  websiteUrl: str(row.website_url),
  googleMapsUrl: str(row.google_maps_url),
  types: strArray(row.types),
  keywordsFoundBy: strArray(row.keywords_found_by),
  priorityScore: num(row.priority_score),
  bucket: str(row.bucket) as OutreachBucket,
  bestChannel: str(row.best_channel) as OutreachChannel,
  status: str(row.status) as OutreachStatus,
  lastAction: nullableStr(row.last_action) as OutreachActionType | null,
  lastActionAt: nullableStr(row.last_action_at),
  nextAction: nullableStr(row.next_action) as OutreachActionType | null,
  nextActionAt: nullableStr(row.next_action_at),
  cadenceStep: num(row.cadence_step),
  cadenceTrack: str(row.cadence_track) as OutreachCadenceTrack,
  notes: str(row.notes),
  source: str(row.source),
  sourceId: nullableStr(row.source_id),
  createdAt: str(row.created_at),
  updatedAt: str(row.updated_at),
});

export const outreachLeadToRow = (lead: OutreachLead): Row => ({
  id: lead.id,
  venue_name: lead.venueName ?? "",
  city: lead.city ?? "",
  address: lead.address ?? "",
  phone_raw: lead.phoneRaw ?? "",
  phone_e164: lead.phoneE164 || null,
  website_url: lead.websiteUrl ?? "",
  google_maps_url: lead.googleMapsUrl ?? "",
  types: lead.types ?? [],
  keywords_found_by: lead.keywordsFoundBy ?? [],
  priority_score: lead.priorityScore ?? 0,
  bucket: lead.bucket,
  best_channel: lead.bestChannel,
  status: lead.status,
  last_action: lead.lastAction,
  last_action_at: lead.lastActionAt,
  next_action: lead.nextAction,
  next_action_at: lead.nextActionAt,
  cadence_step: lead.cadenceStep ?? 0,
  cadence_track: lead.cadenceTrack,
  notes: lead.notes ?? "",
  source: lead.source ?? "",
  source_id: lead.sourceId,
  created_at: lead.createdAt,
  updated_at: lead.updatedAt,
});

export const outreachActionFromRow = (row: Row): OutreachActionLog => ({
  id: str(row.id),
  leadId: str(row.lead_id),
  action: str(row.action) as OutreachActionType,
  statusAfter: str(row.status_after) as OutreachStatus,
  notes: str(row.notes),
  createdAt: str(row.created_at),
});

export const outreachActionToRow = (action: OutreachActionLog): Row => ({
  id: action.id,
  lead_id: action.leadId,
  action: action.action,
  status_after: action.statusAfter,
  notes: action.notes ?? "",
  created_at: action.createdAt,
});

export const outreachImportFromRow = (row: Row): OutreachImportSummary => ({
  id: str(row.id),
  fileName: str(row.file_name),
  createdAt: str(row.created_at),
  totalRows: num(row.total_rows),
  importedCount: num(row.imported_count),
  skippedCount: num(row.skipped_count),
  dedupedCount: num(row.deduped_count),
  errors: strArray(row.errors),
});

export const outreachImportToRow = (summary: OutreachImportSummary): Row => ({
  id: summary.id,
  file_name: summary.fileName ?? "",
  total_rows: summary.totalRows ?? 0,
  imported_count: summary.importedCount ?? 0,
  skipped_count: summary.skippedCount ?? 0,
  deduped_count: summary.dedupedCount ?? 0,
  errors: summary.errors ?? [],
  created_at: summary.createdAt,
});
