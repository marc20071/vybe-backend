-- VYBE expanded social/messaging migration. Apply once in Supabase SQL Editor.
-- Backend-mediated access is required; do not expose service-role credentials to the browser.
alter table public.profiles add column if not exists is_private boolean not null default false;
alter table public.profiles add column if not exists message_privacy text not null default 'everyone' check (message_privacy in ('everyone','followers','nobody'));
alter table public.conversations add column if not exists kind text not null default 'direct' check (kind in ('direct','group'));
alter table public.conversations add column if not exists title text;
alter table public.conversations add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.conversation_members add column if not exists role text not null default 'member' check (role in ('admin','member'));
alter table public.conversation_members add column if not exists joined_at timestamptz not null default now();
alter table public.messages add column if not exists message_type text not null default 'text' check (message_type in ('text','image','video','file','voice','system'));
alter table public.messages add column if not exists attachment_url text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_mime text;
alter table public.messages add column if not exists attachment_size bigint;
alter table public.messages add column if not exists duration_seconds integer;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_for_everyone_at timestamptz;
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
create table if not exists public.message_reactions (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, emoji text not null check (char_length(emoji) between 1 and 16), created_at timestamptz not null default now(), unique(message_id,user_id,emoji)
);
create table if not exists public.follow_requests (
 id uuid primary key default gen_random_uuid(), requester_id uuid not null references auth.users(id) on delete cascade,
 target_id uuid not null references auth.users(id) on delete cascade, status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 created_at timestamptz not null default now(), responded_at timestamptz, unique(requester_id,target_id), check(requester_id <> target_id)
);
create table if not exists public.call_sessions (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
 caller_id uuid not null references auth.users(id) on delete cascade, call_type text not null check(call_type in ('voice','video')),
 status text not null default 'ringing' check(status in ('ringing','accepted','rejected','ended','missed')),
 created_at timestamptz not null default now(), ended_at timestamptz
);
create table if not exists public.call_signals (
 id bigint generated always as identity primary key, call_id uuid not null references public.call_sessions(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade, recipient_id uuid not null references auth.users(id) on delete cascade,
 signal_type text not null check(signal_type in ('offer','answer','ice-candidate','hangup','reject')),
 payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), consumed_at timestamptz
);
create index if not exists message_reactions_message_idx on public.message_reactions(message_id);
create index if not exists follow_requests_target_status_idx on public.follow_requests(target_id,status,created_at desc);
create index if not exists call_signals_recipient_idx on public.call_signals(recipient_id,call_id,id);
create index if not exists profiles_username_search_idx on public.profiles using gin (to_tsvector('simple', coalesce(username,'') || ' ' || coalesce(display_name,'')));
-- Private-profile reads must be enforced in API services as well as UI. Keep all these tables backend-mediated.
alter table public.message_reactions enable row level security;
alter table public.follow_requests enable row level security;
alter table public.call_sessions enable row level security;
alter table public.call_signals enable row level security;
