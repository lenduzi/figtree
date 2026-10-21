import { supabase } from "@/lib/supabase";
import { ATTACHMENTS_BUCKET } from "@/lib/gmail";

export type BrainSection = "company" | "offer" | "customers" | "proof" | "objections" | "voice" | "other";

export const BRAIN_SECTIONS: { id: BrainSection; title: string; hint: string }[] = [
  { id: "company", title: "Company & product", hint: "What you do, how it works, your links." },
  { id: "offer", title: "Offer & pricing", hint: "Prices, packages, what's included, how to start." },
  { id: "customers", title: "Target customers", hint: "Who you sell to, their problems, the angle per segment." },
  { id: "proof", title: "Proof & results", hint: "Customers you can name, numbers you can quote." },
  { id: "objections", title: "Objections & answers", hint: "What people push back on and how you answer." },
  { id: "voice", title: "Voice & style", hint: "How you write: tone, du/Sie, words to use or avoid." },
  { id: "other", title: "Other", hint: "Anything else Claude should know." },
];

export type BrainEntry = {
  id: string;
  section: BrainSection;
  title: string;
  content: string;
  sort_order: number;
  updated_at: string;
};

export type BrainFile = {
  id: string;
  path: string;
  filename: string;
  mime_type: string;
  size: number;
  description: string;
  created_at: string;
};

const getClient = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};

const getUserId = async () => {
  const { data } = await getClient().auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Not signed in");
  return userId;
};

export const listBrainEntries = async () => {
  const { data, error } = await getClient()
    .from("brain_entries")
    .select("id, section, title, content, sort_order, updated_at")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as BrainEntry[];
};

export const createBrainEntry = async (section: BrainSection, sortOrder: number) => {
  const { data, error } = await getClient()
    .from("brain_entries")
    .insert({ section, title: "", content: "", sort_order: sortOrder })
    .select("id, section, title, content, sort_order, updated_at")
    .single();
  if (error) throw error;
  return data as BrainEntry;
};

export const updateBrainEntry = async (id: string, changes: Partial<Pick<BrainEntry, "title" | "content">>) => {
  const { error } = await getClient().from("brain_entries").update(changes).eq("id", id);
  if (error) throw error;
};

export const deleteBrainEntry = async (id: string) => {
  const { error } = await getClient().from("brain_entries").delete().eq("id", id);
  if (error) throw error;
};

export const listBrainFiles = async () => {
  const { data, error } = await getClient()
    .from("brain_files")
    .select("id, path, filename, mime_type, size, description, created_at")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as BrainFile[];
};

export const uploadBrainFile = async (file: File) => {
  const client = getClient();
  const userId = await getUserId();
  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  const path = `${userId}/brain/${crypto.randomUUID()}/${safeName}`;
  const mimeType = file.type || "application/octet-stream";
  const { error: uploadError } = await client.storage.from(ATTACHMENTS_BUCKET).upload(path, file, { contentType: mimeType });
  if (uploadError) throw uploadError;
  const { data, error } = await client
    .from("brain_files")
    .insert({ path, filename: file.name, mime_type: mimeType, size: file.size })
    .select("id, path, filename, mime_type, size, description, created_at")
    .single();
  if (error) {
    await client.storage.from(ATTACHMENTS_BUCKET).remove([path]);
    throw error;
  }
  return data as BrainFile;
};

export const updateBrainFileDescription = async (id: string, description: string) => {
  const { error } = await getClient().from("brain_files").update({ description }).eq("id", id);
  if (error) throw error;
};

export const deleteBrainFile = async (file: BrainFile) => {
  const client = getClient();
  const { error } = await client.from("brain_files").delete().eq("id", file.id);
  if (error) throw error;
  await client.storage.from(ATTACHMENTS_BUCKET).remove([file.path]);
};
