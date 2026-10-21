-- AI research: enrich companies (contact details, decision-makers, fit, a
-- research brief) and prospect for new ones. Work runs through a job queue
-- processed by the research-worker edge function every 2 minutes.

alter table public.companies
  add column research text not null default '',
  add column enriched_at timestamptz,
  -- New AI-found prospects wait for the user to accept or reject them.
  add column needs_review boolean not null default false;
create index companies_needs_review_idx on public.companies (user_id) where needs_review;

-- What to look for, e.g. "Paint & Sip studios" in "Hamburg", 10 new per week.
create table public.prospect_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  query text not null default '',
  location text not null default '',
  company_type text not null default 'venue' check (company_type in ('venue', 'brand', 'chain', 'partner', 'other')),
  weekly_target integer not null default 10 check (weekly_target between 1 and 50),
  active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger prospect_searches_set_updated_at before update on public.prospect_searches
  for each row execute function public.set_updated_at();

create table public.research_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('enrich', 'prospect')),
  company_id uuid references public.companies (id) on delete cascade,
  search_id uuid references public.prospect_searches (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error text,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index research_jobs_queue_idx on public.research_jobs (status, created_at);
create index research_jobs_user_idx on public.research_jobs (user_id, finished_at);
-- Don't queue the same company twice.
create unique index research_jobs_one_open_enrich_idx on public.research_jobs (company_id)
  where kind = 'enrich' and status in ('queued', 'running');

alter table public.prospect_searches enable row level security;
alter table public.research_jobs enable row level security;
create policy "Users manage own prospect searches" on public.prospect_searches for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users manage own research jobs" on public.research_jobs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Same URL scheme and shared secret as send-reminders.
select cron.schedule(
  'research-worker',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := replace(
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_function_url'),
      '/send-reminders', '/research-worker'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  -- Only bother the function when there is work or a search may be due.
  where exists (select 1 from public.research_jobs where status = 'queued')
     or exists (
       select 1 from public.prospect_searches
       where active and (last_run_at is null or last_run_at < now() - interval '7 days')
     );
  $cron$
);
