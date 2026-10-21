import { differenceInCalendarDays } from "date-fns";
import { OPEN_DEAL_LIFECYCLES, type Company, type Contact, type Stage, type Task } from "@/types/crm";

export const COLD_AFTER_DAYS = 14;

const CLOSED_STAGE_KEYS = new Set(["won", "lost"]);

export const isClosedStage = (stage?: Stage) => {
  if (!stage) return false;
  return CLOSED_STAGE_KEYS.has(stage.id) || CLOSED_STAGE_KEYS.has(stage.name.trim().toLowerCase());
};

/** Days since the last logged interaction, falling back to when the contact was added. */
export const getDaysSinceTouch = (contact: Contact, now = new Date()) => {
  const last = new Date(contact.lastInteractionDate || contact.createdAt);
  if (Number.isNaN(last.getTime())) return null;
  return differenceInCalendarDays(now, last);
};

/**
 * A contact is going cold when it's in an open deal stage, has no open task
 * scheduled, and hasn't been touched for COLD_AFTER_DAYS.
 */
export const isGoingCold = (
  contact: Contact,
  options: { stage?: Stage; openTaskCount: number; meContactId?: string | null; now?: Date },
) => {
  if (contact.id === options.meContactId) return false;
  if (options.openTaskCount > 0) return false;
  if (isClosedStage(options.stage)) return false;
  const days = getDaysSinceTouch(contact, options.now);
  return days !== null && days >= COLD_AFTER_DAYS;
};

export const getColdContacts = (
  contacts: Contact[],
  tasks: Task[],
  stages: Stage[],
  meContactId?: string | null,
  now = new Date(),
) => {
  const openTaskCounts = new Map<string, number>();
  tasks.forEach((task) => {
    if (task.completed) return;
    openTaskCounts.set(task.contactId, (openTaskCounts.get(task.contactId) ?? 0) + 1);
  });
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));

  return contacts
    .filter((contact) =>
      isGoingCold(contact, {
        stage: stageById.get(contact.stageId),
        openTaskCount: openTaskCounts.get(contact.id) ?? 0,
        meContactId,
        now,
      }),
    )
    .map((contact) => ({ contact, daysSinceTouch: getDaysSinceTouch(contact, now) ?? 0 }))
    .sort((a, b) => b.daysSinceTouch - a.daysSinceTouch);
};

/** Days since anything happened with a company (falls back to its last stage change). */
export const getCompanyDaysSinceTouch = (company: Company, now = new Date()) => {
  const last = new Date(company.lastActivityAt || company.lifecycleChangedAt || company.createdAt);
  if (Number.isNaN(last.getTime())) return null;
  return differenceInCalendarDays(now, last);
};

/**
 * Open deals (talking → pilot) with no open task and no activity for
 * COLD_AFTER_DAYS. Contacting is left out: the call cadence handles those.
 */
export const getColdCompanies = (companies: Company[], tasks: Task[], now = new Date()) => {
  const withOpenTask = new Set(tasks.filter((task) => !task.completed && task.companyId).map((task) => task.companyId));
  return companies
    .filter((company) => OPEN_DEAL_LIFECYCLES.includes(company.lifecycle) && !withOpenTask.has(company.id))
    .map((company) => ({ company, daysSinceTouch: getCompanyDaysSinceTouch(company, now) ?? 0 }))
    .filter(({ daysSinceTouch }) => daysSinceTouch >= COLD_AFTER_DAYS)
    .sort((a, b) => b.daysSinceTouch - a.daysSinceTouch);
};
