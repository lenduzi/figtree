-- Email attachments: files live in a private storage bucket under the user's
-- id; emails.attachments lists them ({path, filename, mime_type, size}).

alter table public.emails add column attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit)
values ('email-attachments', 'email-attachments', false, 26214400)
on conflict (id) do nothing;

-- Users can only touch files under their own folder: <user id>/...
create policy "Users upload own email attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'email-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users read own email attachments" on storage.objects for select to authenticated
  using (bucket_id = 'email-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete own email attachments" on storage.objects for delete to authenticated
  using (bucket_id = 'email-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
