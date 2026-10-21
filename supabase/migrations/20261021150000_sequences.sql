-- Sequences: multi-step plays (calls + emails) run on a company. The
-- send-reminders job turns due steps into call tasks or Claude drafts that
-- wait for approval, and schedules the next step once the current one is done.

create table public.sequences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  description text not null default '',
  audience text not null default 'any' check (audience in ('venue', 'brand', 'any')),
  -- [{ "wait_days": int, "channel": "call" | "email", "label": text,
  --    "instructions": text, "reply_in_thread": bool }]
  -- wait_days: business days after the previous step was done (first: after start).
  steps jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sequences_set_updated_at before update on public.sequences
  for each row execute function public.set_updated_at();

alter table public.emails drop constraint emails_status_check;
alter table public.emails add constraint emails_status_check
  check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'));
-- Follow-ups reply in the thread of an earlier email.
alter table public.emails add column reply_to_email_id uuid references public.emails (id) on delete set null;

create table public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sequence_id uuid not null references public.sequences (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  -- Address for email steps; empty means "the person's, else the company's".
  to_email text not null default '',
  -- active: next step scheduled for next_step_on; waiting: a task or draft is
  -- waiting on the user; paused; completed; stopped (see stop_reason).
  status text not null default 'active'
    check (status in ('active', 'waiting', 'paused', 'completed', 'stopped')),
  step_index integer not null default 0,
  next_step_on date,
  start_lifecycle text not null default 'sourced',
  stop_reason text not null default '',
  pending_task_id uuid references public.tasks (id) on delete set null,
  pending_email_id uuid references public.emails (id) on delete set null,
  last_email_id uuid references public.emails (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sequence_enrollments_set_updated_at before update on public.sequence_enrollments
  for each row execute function public.set_updated_at();
create index sequence_enrollments_due_idx on public.sequence_enrollments (user_id, status, next_step_on);
create index sequence_enrollments_company_idx on public.sequence_enrollments (company_id);
-- One running play per company at a time.
create unique index sequence_enrollments_one_running_idx on public.sequence_enrollments (company_id)
  where status in ('active', 'waiting', 'paused');

alter table public.emails add column enrollment_id uuid references public.sequence_enrollments (id) on delete set null;
alter table public.emails add column step_index integer;

alter table public.sequences enable row level security;
alter table public.sequence_enrollments enable row level security;
create policy "Users manage own sequences" on public.sequences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users manage own enrollments" on public.sequence_enrollments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
