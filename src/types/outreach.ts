export type OutreachStatus =
  | "New"
  | "Attempting"
  | "Reached Gatekeeper"
  | "Spoke to Decision Maker"
  | "Interested"
  | "Pilot Proposed"
  | "Pilot Live"
  | "Won"
  | "Not Now"
  | "No"
  | "Dead/Invalid";

export type OutreachActionType =
  | "Called"
  | "WhatsApp sent"
  | "Left voicemail"
  | "Reached front desk"
  | "Asked for marketing contact"
  | "Sent email"
  | "Submitted contact form"
  | "IG DM sent"
  | "Walk-in";

export type OutreachBucket = "A" | "B" | "C";

export type OutreachChannel =
  | "call"
  | "whatsapp"
  | "email"
  | "form"
  | "ig"
  | "walkin"
  | "unknown";

export type OutreachCadenceTrack = "phone" | "no_phone";

export interface OutreachLead {
  id: string;
  venueName: string;
  city: string;
  address: string;
  phoneRaw: string;
  phoneE164: string | null;
  websiteUrl: string;
  googleMapsUrl: string;
  types: string[];
  keywordsFoundBy: string[];
  priorityScore: number;
  bucket: OutreachBucket;
  bestChannel: OutreachChannel;
  status: OutreachStatus;
  lastAction: OutreachActionType | null;
  lastActionAt: string | null;
  nextAction: OutreachActionType | null;
  nextActionAt: string | null;
  cadenceStep: number;
  cadenceTrack: OutreachCadenceTrack;
  notes: string;
  source: string;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachActionLog {
  id: string;
  leadId: string;
  action: OutreachActionType;
  statusAfter: OutreachStatus;
  notes: string;
  createdAt: string;
}

export interface OutreachImportSummary {
  id: string;
  fileName: string;
  createdAt: string;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  dedupedCount: number;
  errors: string[];
}

export const OUTREACH_STATUSES: OutreachStatus[] = [
  "New",
  "Attempting",
  "Reached Gatekeeper",
  "Spoke to Decision Maker",
  "Interested",
  "Pilot Proposed",
  "Pilot Live",
  "Won",
  "Not Now",
  "No",
  "Dead/Invalid",
];

export const OUTREACH_ACTIONS: OutreachActionType[] = [
  "Called",
  "WhatsApp sent",
  "Left voicemail",
  "Reached front desk",
  "Asked for marketing contact",
  "Sent email",
  "Submitted contact form",
  "IG DM sent",
  "Walk-in",
];

export const OUTREACH_FINAL_STATUSES: OutreachStatus[] = [
  "Interested",
  "Pilot Proposed",
  "Pilot Live",
  "Won",
  "Not Now",
  "No",
  "Dead/Invalid",
];
