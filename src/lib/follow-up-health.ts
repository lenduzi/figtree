import { differenceInCalendarDays } from "date-fns";
import type { Contact, Stage, Task } from "@/types/crm";

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
