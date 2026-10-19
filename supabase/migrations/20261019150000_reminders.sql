-- Push reminders: per-task reminders at the due time and a morning digest.
-- A pg_cron job calls the send-reminders edge function every 5 minutes. The
-- function URL and shared secret are read from Vault (set outside this
-- migration, see supabase/functions/send-reminders/README.md).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Per-user settings. timezone is kept in sync by the app (IANA name).
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  timezone text not null default 'UTC',
  digest_enabled boolean not null default true,
  digest_hour integer not null default 9 check (digest_hour between 0 and 23),
  last_digest_on date,
  updated_at timestamptz not null default now()
);
create trigger user_settings_set_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- One row per browser/device that has allowed notifications.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- Set once a task's reminder has been sent (or skipped as too old), so it
-- isn't sent again. Changing the due date/time clears it.
alter table public.tasks add column reminded_at timestamptz;

create or replace function public.reset_task_reminder()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.due_date is distinct from old.due_date or new.due_time is distinct from old.due_time then
    new.reminded_at = null;
  end if;
  return new;
end;
$$;

create trigger tasks_reset_reminder before update on public.tasks
  for each row execute function public.reset_task_reminder();

create index tasks_pending_reminder_idx on public.tasks (user_id, due_date)
  where has_reminder and not completed and reminded_at is null and due_time is not null;

do $$
declare
  t text;
begin
  foreach t in array array['user_settings', 'push_subscriptions']
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

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
