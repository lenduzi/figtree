# send-reminders

Sends push notifications: task reminders at their due time (tasks with a time
and "Enable Reminder" on) and a morning digest at the hour set in Settings.

## Setup (once per project)

1. Function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   (a URL or `mailto:`), and `CRON_SECRET` (any long random string), via
   `supabase secrets set`.
2. Vault secrets read by the pg_cron job in
   `migrations/20261019150000_reminders.sql`:
   - `reminders_function_url`: `https://<project-ref>.supabase.co/functions/v1/send-reminders`
   - `reminders_cron_secret`: the same value as `CRON_SECRET`
3. Deploy: `supabase functions deploy send-reminders --use-api`

The VAPID public key is also in `src/lib/notifications.ts`.
