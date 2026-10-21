-- Emails being written are saved as drafts (status 'draft', no enrollment),
-- so closing the compose window never loses them. Sequence drafts keep their
-- enrollment_id and stay in the approval queue.

alter table public.emails
  -- Earlier versions of the draft: [{ subject, body, instructions, saved_at }], newest first.
  add column draft_history jsonb not null default '[]'::jsonb,
  -- The last instruction given to Claude for this email.
  add column draft_instructions text not null default '';

create index emails_manual_drafts_idx on public.emails (company_id)
  where status = 'draft' and enrollment_id is null;
