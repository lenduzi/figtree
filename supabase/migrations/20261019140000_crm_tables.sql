-- Move core CRM data (stages, contacts, tasks, activities, outreach) out of the
-- single user_backups JSON blob into real tables, so server-side jobs
-- (reminders, digests, email) can query them. user_backups is left untouched.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Stages ---------------------------------------------------------------------
-- Stage ids are short slugs ('lead', 'won', ...) shared across users, so the key
-- is (user_id, id).
create table public.stages (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  color text not null default '',
  sort_order integer not null default 0,
  primary key (user_id, id)
);

-- Contacts -------------------------------------------------------------------
create table public.contacts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default '',
  company text not null default '',
  website text not null default '',
  email text not null default '',
  phone text not null default '',
  stage_id text not null,
  notes text not null default '',
  notes_last_edited timestamptz,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, stage_id) references public.stages (user_id, id) on update cascade
);
create index contacts_user_id_idx on public.contacts (user_id);
create index contacts_user_stage_idx on public.contacts (user_id, stage_id);
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- Tasks ----------------------------------------------------------------------
-- due_date is the user's local calendar date; due_time is optional local time.
create table public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  title text not null default '',
  description text not null default '',
  due_date date not null,
  due_time time,
  has_reminder boolean not null default true,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_contact_id_idx on public.tasks (contact_id);
create index tasks_open_due_idx on public.tasks (user_id, due_date) where not completed;

-- Activities -----------------------------------------------------------------
create table public.activities (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  type text not null,
  description text not null default '',
  occurred_at timestamptz not null default now()
);
create index activities_contact_id_idx on public.activities (contact_id);
create index activities_user_id_idx on public.activities (user_id);

-- Outreach -------------------------------------------------------------------
create table public.outreach_leads (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  venue_name text not null default '',
  city text not null default '',
  address text not null default '',
  phone_raw text not null default '',
  phone_e164 text,
  website_url text not null default '',
  google_maps_url text not null default '',
  types text[] not null default '{}',
  keywords_found_by text[] not null default '{}',
  priority_score double precision not null default 0,
  bucket text not null default 'C',
  best_channel text not null default 'unknown',
  status text not null default 'New',
  last_action text,
  last_action_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  cadence_step integer not null default 0,
  cadence_track text not null default 'no_phone',
  notes text not null default '',
  source text not null default '',
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index outreach_leads_user_id_idx on public.outreach_leads (user_id);
create index outreach_leads_next_action_idx on public.outreach_leads (user_id, next_action_at)
  where next_action_at is not null;
create trigger outreach_leads_set_updated_at before update on public.outreach_leads
  for each row execute function public.set_updated_at();

create table public.outreach_actions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid not null references public.outreach_leads (id) on delete cascade,
  action text not null,
  status_after text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index outreach_actions_lead_id_idx on public.outreach_actions (lead_id);
create index outreach_actions_user_id_idx on public.outreach_actions (user_id);

create table public.outreach_imports (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null default '',
  total_rows integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  deduped_count integer not null default 0,
  errors text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index outreach_imports_user_id_idx on public.outreach_imports (user_id);

-- Row level security: every row belongs to exactly one user --------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'stages', 'contacts', 'tasks', 'activities',
    'outreach_leads', 'outreach_actions', 'outreach_imports'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Users manage own rows" on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;

-- Import ---------------------------------------------------------------------
-- Replaces the caller's CRM rows with the contents of a backup payload (the
-- app's JSON backup format). With no payload it uses the caller's
-- user_backups row. Runs as the caller, so RLS scopes every read and write.
create or replace function public.import_crm_backup(payload jsonb default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d jsonb;
  result jsonb;
begin
  if uid is null then
    raise exception 'import_crm_backup requires a signed-in user';
  end if;

  if payload is null then
    select b.backup into payload from public.user_backups b where b.user_id = uid;
    if payload is null then
      return jsonb_build_object('imported', false, 'reason', 'no backup found');
    end if;
  end if;

  d := payload -> 'data';
  if d is null or jsonb_typeof(d -> 'contacts') <> 'array' then
    raise exception 'payload is not a valid CRM backup';
  end if;

  -- Contacts cascade to tasks and activities.
  delete from public.contacts where user_id = uid;
  delete from public.stages where user_id = uid;

  insert into public.stages (user_id, id, name, color, sort_order)
  select uid, s ->> 'id', coalesce(s ->> 'name', s ->> 'id'), coalesce(s ->> 'color', ''),
         coalesce((s ->> 'order')::integer, (ord - 1)::integer)
  from jsonb_array_elements(coalesce(d -> 'settings' -> 'stages', '[]'::jsonb)) with ordinality as x(s, ord);

  -- Any stage a contact points at must exist, even if the backup's stage list lacks it.
  insert into public.stages (user_id, id, name, color, sort_order)
  select uid, missing.id, initcap(replace(missing.id, '-', ' ')), '', 100 + row_number() over ()
  from (
    select distinct c ->> 'stageId' as id
    from jsonb_array_elements(d -> 'contacts') c
    where c ->> 'stageId' is not null
  ) missing
  on conflict do nothing;

  insert into public.contacts (
    id, user_id, full_name, role, company, website, email, phone, stage_id, notes,
    notes_last_edited, last_interaction_at, created_at, updated_at
  )
  select (c ->> 'id')::uuid, uid,
         coalesce(c ->> 'fullName', ''), coalesce(c ->> 'role', ''), coalesce(c ->> 'company', ''),
         coalesce(c ->> 'website', ''), coalesce(c ->> 'email', ''), coalesce(c ->> 'phone', ''),
         c ->> 'stageId', coalesce(c ->> 'notes', ''),
         nullif(c ->> 'notesLastEdited', '')::timestamptz,
         nullif(c ->> 'lastInteractionDate', '')::timestamptz,
         coalesce(nullif(c ->> 'createdAt', '')::timestamptz, now()),
         coalesce(nullif(c ->> 'updatedAt', '')::timestamptz, now())
  from jsonb_array_elements(d -> 'contacts') c;

  insert into public.tasks (
    id, user_id, contact_id, title, description, due_date, due_time, has_reminder, completed, created_at
  )
  select (t ->> 'id')::uuid, uid, (t ->> 'contactId')::uuid,
         coalesce(t ->> 'title', ''), coalesce(t ->> 'description', ''),
         (t ->> 'dueDate')::date, nullif(t ->> 'dueTime', '')::time,
         coalesce((t ->> 'hasReminder')::boolean, true), coalesce((t ->> 'completed')::boolean, false),
         coalesce(nullif(t ->> 'createdAt', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(d -> 'tasks', '[]'::jsonb)) t
  where exists (select 1 from public.contacts c where c.id = (t ->> 'contactId')::uuid);

  insert into public.activities (id, user_id, contact_id, type, description, occurred_at)
  select (a ->> 'id')::uuid, uid, (a ->> 'contactId')::uuid,
         a ->> 'type', coalesce(a ->> 'description', ''),
         coalesce(nullif(a ->> 'timestamp', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(d -> 'activities', '[]'::jsonb)) a
  where exists (select 1 from public.contacts c where c.id = (a ->> 'contactId')::uuid);

  -- Older backups have no outreach section; leave outreach alone for those.
  if d ? 'outreach' then
  -- Leads cascade to their actions.
  delete from public.outreach_leads where user_id = uid;
  delete from public.outreach_imports where user_id = uid;

  insert into public.outreach_leads (
    id, user_id, venue_name, city, address, phone_raw, phone_e164, website_url, google_maps_url,
    types, keywords_found_by, priority_score, bucket, best_channel, status, last_action,
    last_action_at, next_action, next_action_at, cadence_step, cadence_track, notes, source,
    source_id, created_at, updated_at
  )
  select (l ->> 'id')::uuid, uid,
         coalesce(l ->> 'venueName', ''), coalesce(l ->> 'city', ''), coalesce(l ->> 'address', ''),
         coalesce(l ->> 'phoneRaw', ''), nullif(l ->> 'phoneE164', ''),
         coalesce(l ->> 'websiteUrl', ''), coalesce(l ->> 'googleMapsUrl', ''),
         coalesce(array(select jsonb_array_elements_text(l -> 'types')), '{}'),
         coalesce(array(select jsonb_array_elements_text(l -> 'keywordsFoundBy')), '{}'),
         coalesce((l ->> 'priorityScore')::double precision, 0),
         coalesce(l ->> 'bucket', 'C'), coalesce(l ->> 'bestChannel', 'unknown'),
         coalesce(l ->> 'status', 'New'), l ->> 'lastAction',
         nullif(l ->> 'lastActionAt', '')::timestamptz, l ->> 'nextAction',
         nullif(l ->> 'nextActionAt', '')::timestamptz,
         coalesce((l ->> 'cadenceStep')::integer, 0), coalesce(l ->> 'cadenceTrack', 'no_phone'),
         coalesce(l ->> 'notes', ''), coalesce(l ->> 'source', ''), l ->> 'sourceId',
         coalesce(nullif(l ->> 'createdAt', '')::timestamptz, now()),
         coalesce(nullif(l ->> 'updatedAt', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(d -> 'outreach' -> 'leads', '[]'::jsonb)) l;

  insert into public.outreach_actions (id, user_id, lead_id, action, status_after, notes, created_at)
  select (a ->> 'id')::uuid, uid, (a ->> 'leadId')::uuid, a ->> 'action',
         coalesce(a ->> 'statusAfter', ''), coalesce(a ->> 'notes', ''),
         coalesce(nullif(a ->> 'createdAt', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(d -> 'outreach' -> 'actions', '[]'::jsonb)) a
  where exists (select 1 from public.outreach_leads l where l.id = (a ->> 'leadId')::uuid);

  insert into public.outreach_imports (
    id, user_id, file_name, total_rows, imported_count, skipped_count, deduped_count, errors, created_at
  )
  select (i ->> 'id')::uuid, uid, coalesce(i ->> 'fileName', ''),
         coalesce((i ->> 'totalRows')::integer, 0), coalesce((i ->> 'importedCount')::integer, 0),
         coalesce((i ->> 'skippedCount')::integer, 0), coalesce((i ->> 'dedupedCount')::integer, 0),
         coalesce(array(select jsonb_array_elements_text(i -> 'errors')), '{}'),
         coalesce(nullif(i ->> 'createdAt', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(d -> 'outreach' -> 'imports', '[]'::jsonb)) i;
  end if;

  select jsonb_build_object(
    'imported', true,
    'stages', (select count(*) from public.stages where user_id = uid),
    'contacts', (select count(*) from public.contacts where user_id = uid),
    'tasks', (select count(*) from public.tasks where user_id = uid),
    'activities', (select count(*) from public.activities where user_id = uid),
    'outreach_leads', (select count(*) from public.outreach_leads where user_id = uid),
    'outreach_actions', (select count(*) from public.outreach_actions where user_id = uid),
    'outreach_imports', (select count(*) from public.outreach_imports where user_id = uid)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.import_crm_backup(jsonb) from public, anon;
grant execute on function public.import_crm_backup(jsonb) to authenticated;
