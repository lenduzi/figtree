-- Research spending cap, per-job cost, and prospect searches that look for
-- buying signals (companies building an ambassador program) instead of
-- look-alike businesses.

alter table public.research_jobs add column cost_eur numeric(10, 4) not null default 0;
create index research_jobs_user_month_idx on public.research_jobs (user_id, created_at);

alter table public.user_settings add column research_budget_eur numeric(8, 2) not null default 20;

alter table public.prospect_searches
  add column strategy text not null default 'lookalike' check (strategy in ('lookalike', 'intent'));
-- 'any': let the research decide whether it's a venue, brand, chain, ...
alter table public.prospect_searches drop constraint prospect_searches_company_type_check;
alter table public.prospect_searches add constraint prospect_searches_company_type_check
  check (company_type in ('venue', 'brand', 'chain', 'partner', 'other', 'any'));

-- What research has cost this calendar month (Europe/Berlin), for the cap.
create or replace function public.research_spend_this_month(target_user uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(cost_eur), 0)
  from public.research_jobs
  where user_id = target_user
    and created_at >= date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
$$;
