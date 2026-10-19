-- Gmail integration: connect a Gmail account, send and schedule emails to
-- contacts, detect replies, and email the user their digest and reminders.

-- Connected account, visible to the user.
create table public.gmail_accounts (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  email text not null,
  connected_at timestamptz not null default now()
);

-- OAuth tokens: RLS on with no policies, so only the service role (edge
-- functions) can read or write them.
create table public.gmail_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scope text not null default '',
  updated_at timestamptz not null default now()
);

-- Pending OAuth sign-ins (state parameter -> user), service role only.
create table public.gmail_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_to text not null,
  created_at timestamptz not null default now()
);

-- Emails to contacts. status: scheduled -> sending -> sent | failed; or cancelled.
create table public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  to_email text not null,
  subject text not null default '',
  body text not null default '',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  gmail_message_id text,
  gmail_thread_id text,
  error text,
  replied_at timestamptz,
  reply_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index emails_contact_id_idx on public.emails (contact_id);
create index emails_due_idx on public.emails (scheduled_for) where status = 'scheduled';
create index emails_awaiting_reply_idx on public.emails (sent_at)
  where status = 'sent' and replied_at is null and gmail_thread_id is not null;
create trigger emails_set_updated_at before update on public.emails
  for each row execute function public.set_updated_at();

alter table public.user_settings
  add column email_notifications boolean not null default true,
  add column ai_context text not null default '',
  add column email_signature text not null default '';

alter table public.gmail_accounts enable row level security;
alter table public.gmail_tokens enable row level security;
alter table public.gmail_oauth_states enable row level security;
alter table public.emails enable row level security;

-- The app reads its connection status and can disconnect; connecting goes
-- through the gmail-oauth function.
create policy "Users read own Gmail account" on public.gmail_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users delete own Gmail account" on public.gmail_accounts for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users manage own emails" on public.emails for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Keep contacts.last_interaction_at in step with activities written anywhere
-- (the app, or edge functions logging sent emails and replies).
create or replace function public.touch_contact_last_interaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.contacts
  set last_interaction_at = new.occurred_at
  where id = new.contact_id
    and (last_interaction_at is null or last_interaction_at < new.occurred_at);
  return new;
end;
$$;

create trigger activities_touch_contact after insert on public.activities
  for each row execute function public.touch_contact_last_interaction();

-- The app saves whole contact rows from its in-memory copy, which can be older
-- than an interaction an edge function just logged; never move it backwards.
create or replace function public.keep_latest_last_interaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.last_interaction_at is not null
     and (new.last_interaction_at is null or new.last_interaction_at < old.last_interaction_at) then
    new.last_interaction_at = old.last_interaction_at;
  end if;
  return new;
end;
$$;

create trigger contacts_keep_latest_last_interaction before update on public.contacts
  for each row execute function public.keep_latest_last_interaction();
