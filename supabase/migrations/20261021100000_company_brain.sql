-- Company brain: what the business is, sells, and sounds like. Every AI draft
-- reads all of it. Files (pitch deck, one-pagers) can be attached to emails.

create table public.brain_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section text not null default 'other'
    check (section in ('company', 'offer', 'customers', 'proof', 'objections', 'voice', 'other')),
  title text not null default '',
  content text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brain_entries_user_idx on public.brain_entries (user_id, section, sort_order);
create trigger brain_entries_set_updated_at before update on public.brain_entries
  for each row execute function public.set_updated_at();

-- Files live in the email-attachments bucket under <user id>/brain/...,
-- so the existing per-user storage policies cover them.
create table public.brain_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null,
  filename text not null,
  mime_type text not null default 'application/octet-stream',
  size integer not null default 0,
  description text not null default '',
  created_at timestamptz not null default now()
);
create index brain_files_user_idx on public.brain_files (user_id);

-- What Claude drafted, next to what was actually sent (emails.body), so the
-- user's edits can teach the drafts their voice.
alter table public.emails add column ai_draft text;

alter table public.brain_entries enable row level security;
alter table public.brain_files enable row level security;
create policy "Users manage own brain entries" on public.brain_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users manage own brain files" on public.brain_files for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
