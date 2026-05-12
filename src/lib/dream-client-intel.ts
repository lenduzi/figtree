const INTEL_TIMESTAMP_PATTERN = /^\[(.+?)\]\s+(.*)$/;

export type DreamClientIntelSnippet = {
  timestampLabel: string | null;
  text: string;
};

const formatTimestampLabel = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const normalizeIntelSnippet = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ");

export const parseIntelLog = (notes: string): DreamClientIntelSnippet[] => {
  const trimmed = notes.trim();
  if (!trimmed) return [];

  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(INTEL_TIMESTAMP_PATTERN);
      if (!match) {
        return { timestampLabel: null, text: line };
      }

      return {
        timestampLabel: match[1],
        text: match[2],
      };
    });
};

export const appendIntelSnippet = (notes: string, snippet: string, now = new Date()) => {
  const normalized = normalizeIntelSnippet(snippet);
  if (!normalized) return notes;

  const nextLine = `[${formatTimestampLabel(now)}] ${normalized}`;
  const existing = notes.trim();
  return existing ? `${existing}\n${nextLine}` : nextLine;
};

export const getLatestIntelSnippet = (notes: string) => {
  const snippets = parseIntelLog(notes);
  return snippets[snippets.length - 1] ?? null;
};
