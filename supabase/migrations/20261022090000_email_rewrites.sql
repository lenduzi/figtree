-- One-click rewrites of an email draft (shorter, warmer, ...).
alter table public.user_settings
  -- The user's own rewrite buttons: [{ label, instruction }].
  add column rewrite_presets jsonb not null default '[]'::jsonb,
  -- How often each rewrite was used, and whether making it a drafting default
  -- was already offered: { "<key>": { "count": 3, "offered": true } }.
  add column rewrite_stats jsonb not null default '{}'::jsonb;
