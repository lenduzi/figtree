-- One funnel: every venue, brand or chain is a company with one lifecycle.
-- People (public.contacts), tasks, activities and emails hang off it.
-- Tasks without a company or person are the user's personal tasks.
-- outreach_leads/outreach_actions and contacts.stage_id stay as they are
-- (no longer written by the app) until the move has proven itself.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  type text not null default 'other' check (type in ('venue', 'brand', 'chain', 'partner', 'other')),
  industry text not null default '',
  city text not null default '',
  address text not null default '',
  website text not null default '',
  phone text not null default '',
  email text not null default '',
  instagram text not null default '',
  google_maps_url text not null default '',
  lifecycle text not null default 'sourced' check (lifecycle in (
    'sourced', 'qualified', 'contacting', 'talking', 'meeting', 'proposal', 'pilot', 'customer',
    'not_now', 'lost', 'disqualified'
  )),
  lifecycle_changed_at timestamptz not null default now(),
  fit text check (fit in ('A', 'B', 'C')),
  fit_score double precision,
  fit_reason text not null default '',
  lists text[] not null default '{}',
  source text not null default '',
  notes text not null default '',
  lost_reason text not null default '',
  revisit_on date,
  -- Call cadence (carried over from Outreach Ops until sequences replace it).
  next_action text,
  next_action_at timestamptz,
  cadence_step integer not null default 0,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_user_lifecycle_idx on public.companies (user_id, lifecycle);
create index companies_next_action_idx on public.companies (user_id, next_action_at) where next_action_at is not null;
create index companies_lists_idx on public.companies using gin (lists);
create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

create or replace function public.track_lifecycle_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lifecycle is distinct from old.lifecycle then
    new.lifecycle_changed_at = now();
  end if;
  return new;
end;
$$;
create trigger companies_track_lifecycle before update on public.companies
  for each row execute function public.track_lifecycle_change();

alter table public.contacts add column company_id uuid references public.companies (id) on delete set null;
create index contacts_company_id_idx on public.contacts (company_id);

alter table public.tasks alter column contact_id drop not null;
alter table public.tasks add column company_id uuid references public.companies (id) on delete cascade;
create index tasks_company_id_idx on public.tasks (company_id);

alter table public.activities alter column contact_id drop not null;
alter table public.activities add column company_id uuid references public.companies (id) on delete cascade;
create index activities_company_id_idx on public.activities (company_id);

alter table public.emails add column company_id uuid references public.companies (id) on delete set null;
create index emails_company_id_idx on public.emails (company_id);

-- Activities logged against a person also count for their company.
create or replace function public.touch_company_last_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid := coalesce(new.company_id, (select company_id from public.contacts where id = new.contact_id));
begin
  if target is not null then
    update public.companies
    set last_activity_at = new.occurred_at
    where id = target and (last_activity_at is null or last_activity_at < new.occurred_at);
  end if;
  return new;
end;
$$;
create trigger activities_touch_company after insert on public.activities
  for each row execute function public.touch_company_last_activity();

-- Like contacts, never let a stale in-memory copy move it backwards.
create or replace function public.keep_latest_company_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.last_activity_at is not null
     and (new.last_activity_at is null or new.last_activity_at < old.last_activity_at) then
    new.last_activity_at = old.last_activity_at;
  end if;
  return new;
end;
$$;
create trigger companies_keep_latest_activity before update on public.companies
  for each row execute function public.keep_latest_company_activity();

alter table public.companies enable row level security;
create policy "Users manage own companies" on public.companies for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Tasks and activities saved against a person belong to that person's company
-- too (covers older app versions and edge functions that only know the person).
create or replace function public.fill_company_from_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id is null and new.contact_id is not null then
    new.company_id = (select company_id from public.contacts where id = new.contact_id);
  end if;
  return new;
end;
$$;
create trigger tasks_fill_company before insert or update of contact_id on public.tasks
  for each row execute function public.fill_company_from_contact();
create trigger activities_fill_company before insert on public.activities
  for each row execute function public.fill_company_from_contact();
create trigger emails_fill_company before insert on public.emails
  for each row execute function public.fill_company_from_contact();
