// Lead list import: reads .xlsx/.csv files (e.g. lists made with Claude or
// ChatGPT), guesses what each column means, groups rows into companies with
// their people, and splits them into new companies vs. ones already in Figtree.

import readXlsxFile from "read-excel-file/browser";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { detectDelimiter, parseCsv } from "@/lib/outreach-store";
import type { Company, Contact } from "@/types/crm";

export type Target =
  | "company.name"
  | "company.website"
  | "company.email"
  | "company.phone"
  | "company.city"
  | "company.address"
  | "company.industry"
  | "company.instagram"
  | "company.linkedin"
  | "company.googleMapsUrl"
  | "company.fitReason"
  | "person.fullName"
  | "person.firstName"
  | "person.lastName"
  | "person.role"
  | "person.email"
  | "person.phone"
  | "person.linkedin"
  | "notes"
  | "ignore";

export const TARGETS: { id: Target; label: string; group: "Company" | "Person" | "Other" }[] = [
  { id: "company.name", label: "Company name", group: "Company" },
  { id: "company.website", label: "Website", group: "Company" },
  { id: "company.email", label: "Company email", group: "Company" },
  { id: "company.phone", label: "Company phone", group: "Company" },
  { id: "company.city", label: "City", group: "Company" },
  { id: "company.address", label: "Address", group: "Company" },
  { id: "company.industry", label: "Industry", group: "Company" },
  { id: "company.instagram", label: "Instagram", group: "Company" },
  { id: "company.linkedin", label: "Company LinkedIn", group: "Company" },
  { id: "company.googleMapsUrl", label: "Google Maps link", group: "Company" },
  { id: "company.fitReason", label: "Why they fit", group: "Company" },
  { id: "person.fullName", label: "Person: full name", group: "Person" },
  { id: "person.firstName", label: "Person: first name", group: "Person" },
  { id: "person.lastName", label: "Person: last name", group: "Person" },
  { id: "person.role", label: "Person: role", group: "Person" },
  { id: "person.email", label: "Person: email", group: "Person" },
  { id: "person.phone", label: "Person: phone", group: "Person" },
  { id: "person.linkedin", label: "Person: LinkedIn", group: "Person" },
  { id: "notes", label: "Add to notes", group: "Other" },
  { id: "ignore", label: "Skip column", group: "Other" },
];

/** Targets that can only be used by one column; the rest may repeat. */
const REPEATABLE = new Set<Target>(["notes", "ignore", "company.fitReason"]);

export type Sheet = { name: string; rows: string[][] };

const cellToText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value).trim();
};

/** Reads every sheet of an .xlsx file, or the one table in a .csv/.tsv. */
export const readLeadFile = async (file: File): Promise<Sheet[]> => {
  const isExcel = /\.xlsx$/i.test(file.name) ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (isExcel) {
    const sheets = await readXlsxFile(file);
    return sheets
      .map((sheet) => ({ name: sheet.sheet, rows: sheet.data.map((row) => row.map(cellToText)) }))
      .filter((sheet) => sheet.rows.some((row) => row.some(Boolean)));
  }
  if (/\.xls$/i.test(file.name)) {
    throw new Error("Old .xls files aren't supported. Save it as .xlsx or .csv and try again.");
  }
  const text = (await file.text()).replace(/^\uFEFF/, "");
  return [{ name: file.name, rows: parseCsv(text, detectDelimiter(text)).map((row) => row.map((cell) => cell.trim())) }];
};

/**
 * Lists from chat tools sometimes start with a title line or a blank row;
 * the header is the first row that is about as wide as the table.
 */
export const findHeaderRow = (rows: string[][]) => {
  const filled = rows.map((row) => row.filter(Boolean).length);
  const widest = Math.max(0, ...filled.slice(0, 30));
  const index = filled.findIndex((count, i) => i < 30 && count >= Math.max(2, Math.ceil(widest * 0.6)));
  return index === -1 ? 0 : index;
};

const norm = (value: string) =>
  value.toLowerCase().replace(/[_\-./()]+/g, " ").replace(/[^a-z0-9äöüß ]+/g, "").replace(/\s+/g, " ").trim();

const PERSON_HINT = /\b(contact|person|kontaktperson|ansprechpartner|ansprechperson|decision maker|poc|founder|owner|ceo|manager|lead|kontakt|inhaber|geschäftsführer|gründer)\b/;
const COMPANY_HINT = /\b(company|firma|unternehmen|business|brand|general|generic|info|office|main|zentrale|allgemein)\b/;
const PERSON_NAME = /\b(contact|person|kontaktperson|ansprechpartner|ansprechperson|decision maker|poc|point of contact|key contact|founder|owner|ceo|inhaber|geschäftsführer|gründer|full name|contact name)\b/;

type Guess = { target: Target; recognized: boolean };

const guessOne = (header: string, hasPersonName: boolean): Guess => {
  const h = norm(header);
  const hit = (target: Target): Guess => ({ target, recognized: true });
  if (!h) return { target: "ignore", recognized: true };

  if (/^(first name|firstname|vorname|given name)$/.test(h)) return hit("person.firstName");
  if (/^(last name|lastname|nachname|surname|family name)$/.test(h)) return hit("person.lastName");
  if (/linkedin/.test(h)) {
    if (COMPANY_HINT.test(h)) return hit("company.linkedin");
    if (PERSON_HINT.test(h) || hasPersonName) return hit("person.linkedin");
    return hit("company.linkedin");
  }
  if (/instagram|^ig\b|insta\b/.test(h)) return hit("company.instagram");
  if (/maps/.test(h)) return hit("company.googleMapsUrl");
  if (/\b(e ?mails?|mail)\b/.test(h)) {
    if (COMPANY_HINT.test(h)) return hit("company.email");
    if (PERSON_HINT.test(h) || hasPersonName) return hit("person.email");
    return hit("company.email");
  }
  if (/phone|telefon|tel\b|mobile|handy|mobil/.test(h)) {
    if (COMPANY_HINT.test(h)) return hit("company.phone");
    if (PERSON_HINT.test(h) || /mobile|handy|mobil/.test(h)) return hit("person.phone");
    return hit("company.phone");
  }
  if (/website|web site|webseite|homepage|domain|url|^site$|^web$/.test(h)) return hit("company.website");
  if (/\b(title|role|position|job|funktion|rolle)\b/.test(h)) return hit("person.role");
  if (/score|priority|priorität|rank|employees|mitarbeiter|size|größe|revenue|umsatz|status|source|quelle/.test(h)) return hit("notes");
  if (/why|reason|rationale|fit|relevance|signal|trigger|evidence|warum|begründ|angle|hook/.test(h)) return hit("company.fitReason");
  if (PERSON_NAME.test(h)) return hit("person.fullName");
  if (/^(company|company name|firma|firmenname|unternehmen|brand|brand name|business|business name|organisation|organization|org|account|account name|venue|venue name|marke|name)$/.test(h) ||
    /\b(company|firma|unternehmen|brand|organi[sz]ation)\b/.test(h)) return hit("company.name");
  if (/address|adresse|street|straße|strasse/.test(h)) return hit("company.address");
  if (/\b(city|stadt|ort|town|location|standort|hq|headquarters?|sitz)\b/.test(h)) return hit("company.city");
  if (/industry|branche|sector|vertical|category|kategorie|niche|segment/.test(h)) return hit("company.industry");
  if (/note|notiz|comment|kommentar|bemerkung|anmerkung|description|beschreibung|summary|about/.test(h)) return hit("notes");
  return { target: "notes", recognized: false };
};

/**
 * Guesses a target per column. Columns nobody recognises go to notes, so
 * nothing in the sheet is lost. `unsure` is true when Claude should look.
 */
export const guessMapping = (headers: string[]) => {
  const hasPersonName = headers.some((header) => {
    const h = norm(header);
    return PERSON_NAME.test(h) || /^(first name|firstname|vorname|last name|nachname)$/.test(h);
  });
  const guesses = headers.map((header) => guessOne(header, hasPersonName));
  const mapping = dedupeTargets(guesses.map((guess) => guess.target));
  const unsure = guesses.some((guess) => !guess.recognized) || !mapping.includes("company.name");
  return { mapping, unsure };
};

/** Keeps the first column for one-off targets; later ones go to notes. */
export const dedupeTargets = (mapping: Target[]) => {
  const used = new Set<Target>();
  return mapping.map((target) => {
    if (REPEATABLE.has(target)) return target;
    if (used.has(target)) return "notes" as Target;
    used.add(target);
    return target;
  });
};

/** Asks Claude (Sonnet, about a cent) to map columns the guesser couldn't place. */
export const mapColumnsWithClaude = async (headers: string[], samples: string[][]): Promise<Target[]> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.functions.invoke("import-map", { body: { headers, samples } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      throw new Error(details?.error ?? error.message);
    }
    throw error;
  }
  const valid = new Set(TARGETS.map((target) => target.id));
  const columns = (data?.columns ?? []) as { index: number; target: string }[];
  const mapping: Target[] = headers.map(() => "notes");
  columns.forEach((column) => {
    if (column.index >= 0 && column.index < headers.length && valid.has(column.target as Target)) {
      mapping[column.index] = column.target as Target;
    }
  });
  return dedupeTargets(mapping);
};

export type PersonDraft = {
  fullName: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
};

export type CompanyDraft = {
  name: string;
  website: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  industry: string;
  instagram: string;
  googleMapsUrl: string;
  fitReason: string;
  notes: string;
  people: PersonDraft[];
};

const TEXT_FIELDS = [
  "name", "website", "email", "phone", "city", "address", "industry",
  "instagram", "googleMapsUrl", "fitReason", "notes",
] as const satisfies readonly (keyof CompanyDraft)[];

export type ImportPlan = {
  fresh: CompanyDraft[];
  /** Companies already in Figtree, with the people from the sheet that are new there. */
  existing: { company: Company; people: PersonDraft[] }[];
  skipped: number;
};

const LEGAL_SUFFIX = /\b(gmbh|ag|ug|kg|co|se|inc|llc|ltd|limited|corp|corporation|plc|bv|sa|sarl|srl|e ?k|ohg|haftungsbeschränkt)\b/g;

export const companyKey = (name: string) =>
  norm(name).replace(LEGAL_SUFFIX, " ").replace(/&|\band\b|\bund\b/g, " ").replace(/\s+/g, " ").trim();

export const hostOf = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|linkedin\.com|instagram\.com/i.test(trimmed)) return "";
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const cleanUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed) || !/\.[a-z]{2,}/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** info@, hello@ … belong to the company, not to a person. */
const isGenericEmail = (value: string) =>
  /^(info|hello|hallo|hi|kontakt|contact|office|mail|team|service|support|sales|vertrieb|post|marketing|press|presse|partner|partnerships|events|booking|buchung|welcome|willkommen)@/i.test(value.trim());

const addLine = (text: string, line: string) => {
  if (!line || text.split("\n").includes(line)) return text;
  return text ? `${text}\n${line}` : line;
};

/** Turns sheet rows into companies (several rows of one company merge). */
export const buildCompanies = (headers: string[], rows: string[][], mapping: Target[]) => {
  const byKey = new Map<string, CompanyDraft>();
  let skipped = 0;

  rows.forEach((row) => {
    // Rows with data only in skipped columns (e.g. a lone row number) are blank.
    if (!mapping.some((target, index) => target !== "ignore" && (row[index] ?? "").trim())) return;
    const values = new Map<Target, string>();
    const company: CompanyDraft = {
      name: "", website: "", email: "", phone: "", city: "", address: "", industry: "",
      instagram: "", googleMapsUrl: "", fitReason: "", notes: "", people: [],
    };
    mapping.forEach((target, index) => {
      const value = (row[index] ?? "").trim();
      if (!value || target === "ignore") return;
      if (target === "notes") company.notes = addLine(company.notes, `${headers[index] || "Note"}: ${value}`);
      else if (target === "company.fitReason") company.fitReason = addLine(company.fitReason, value);
      else values.set(target, value);
    });
    const get = (target: Target) => values.get(target) ?? "";

    company.website = cleanUrl(get("company.website"));
    company.name = get("company.name") || hostOf(company.website);
    if (!company.name) {
      skipped += 1;
      return;
    }
    company.email = looksLikeEmail(get("company.email")) ? get("company.email") : "";
    company.phone = get("company.phone");
    company.city = get("company.city");
    company.address = get("company.address");
    company.industry = get("company.industry");
    company.instagram = get("company.instagram");
    company.googleMapsUrl = get("company.googleMapsUrl");
    if (get("company.linkedin")) company.notes = addLine(company.notes, `LinkedIn: ${get("company.linkedin")}`);

    const fullName = get("person.fullName") || [get("person.firstName"), get("person.lastName")].filter(Boolean).join(" ");
    let personEmail = looksLikeEmail(get("person.email")) ? get("person.email") : "";
    if (personEmail && !fullName && isGenericEmail(personEmail)) {
      company.email = company.email || personEmail;
      personEmail = "";
    }
    if (fullName || personEmail) {
      company.people.push({
        fullName: fullName || personEmail.split("@")[0],
        role: get("person.role"),
        email: personEmail,
        phone: get("person.phone"),
        linkedin: get("person.linkedin"),
      });
    }

    const key = hostOf(company.website) || `${companyKey(company.name)}|${company.city.toLowerCase()}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, company);
      return;
    }
    TEXT_FIELDS.forEach((field) => {
      if (field === "notes" || field === "fitReason") {
        company[field].split("\n").forEach((line) => (current[field] = addLine(current[field], line)));
      } else if (!current[field]) {
        current[field] = company[field];
      }
    });
    company.people.forEach((person) => {
      const known = current.people.some((other) =>
        (person.email && other.email.toLowerCase() === person.email.toLowerCase()) ||
        other.fullName.toLowerCase() === person.fullName.toLowerCase());
      if (!known) current.people.push(person);
    });
  });

  return { companies: [...byKey.values()], skipped };
};

/** Splits sheet companies into new ones and ones you already have. */
export const planImport = (
  headers: string[],
  rows: string[][],
  mapping: Target[],
  knownCompanies: Company[],
  knownContacts: Contact[],
): ImportPlan => {
  const { companies, skipped } = buildCompanies(headers, rows, mapping);
  const byHost = new Map<string, Company>();
  const byName = new Map<string, Company[]>();
  knownCompanies.forEach((company) => {
    const host = hostOf(company.website);
    if (host) byHost.set(host, company);
    const key = companyKey(company.name);
    if (key) byName.set(key, [...(byName.get(key) ?? []), company]);
  });
  const findKnown = (draft: CompanyDraft) => {
    const host = hostOf(draft.website);
    if (host && byHost.has(host)) return byHost.get(host);
    const city = draft.city.toLowerCase();
    return (byName.get(companyKey(draft.name)) ?? []).find(
      (company) => !city || !company.city || company.city.toLowerCase() === city,
    );
  };

  const fresh: CompanyDraft[] = [];
  const existing: ImportPlan["existing"] = [];
  companies.forEach((draft) => {
    const known = findKnown(draft);
    if (!known) {
      fresh.push(draft);
      return;
    }
    const theirPeople = knownContacts.filter((contact) => contact.companyId === known.id);
    const people = draft.people.filter((person) => !theirPeople.some((contact) =>
      (person.email && contact.email.toLowerCase() === person.email.toLowerCase()) ||
      contact.fullName.toLowerCase() === person.fullName.toLowerCase()));
    existing.push({ company: known, people });
  });
  return { fresh, existing, skipped };
};
