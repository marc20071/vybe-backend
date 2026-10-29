-- VYBE complete social/messaging upgrade. Run AFTER supabase-schema.sql and supabase-production-upgrades.sql.
-- Additive/idempotent where possible. Back up production before applying.
begin;

alter table public.profiles add column if not exists is_private boolean not null default false;
alter table public.profiles add column if not exists message_privacy text not null default 'everyone';
alter table public.profiles drop constraint if exists profiles_message_privacy_check;
alter table public.profiles add constraint profiles_message_privacy_check check (message_privacy in ('everyone','followers','nobody'));

alter table public.conversations add column if not exists kind text not null default 'direct';
alter table public.conversations add column if not exists name text;
alter table public.conversations add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.conversation_members add column if not exists role text not null default 'member';
alter table public.conversation_members add column if not exists joined_at timestamptz not null default now();
alter table public.conversation_members add column if not exists cleared_at timestamptz;
alter table public.conversation_members add column if not exists left_at timestamptz;
alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check check (kind in ('direct','group'));
alter table public.conversation_members drop constraint if exists conversation_members_role_check;
alter table public.conversation_members add constraint conversation_members_role_check check (role in ('admin','member'));

alter table public.messages add column if not exists message_type text not null default 'text';
alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_mime_type text;
alter table public.messages add column if not exists attachment_size_bytes bigint;
alter table public.messages add column if not exists deleted_for_everyone_at timestamptz;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages alter column body set default '';
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check check (message_type in ('text','image','video','file','voice','system'));

create table if not exists public.message_reactions (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, emoji text not null check (char_length(emoji) between 1 and 16), created_at timestamptz not null default now(),
 unique(message_id,user_id,emoji)
);
create table if not exists public.follow_requests (
 id uuid primary key default gen_random_uuid(), requester_id uuid not null references auth.users(id) on delete cascade,
 target_id uuid not null references auth.users(id) on delete cascade, status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(requester_id,target_id), check(requester_id<>target_id)
);
create table if not exists public.call_signals (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade, recipient_id uuid not null references auth.users(id) on delete cascade,
 call_id uuid not null, signal_type text not null check(signal_type in ('offer','answer','ice','hangup','reject')),
 payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), consumed_at timestamptz,
 check(sender_id<>recipient_id)
);
create table if not exists public.message_receipts (
 message_id uuid not null references public.messages(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 delivered_at timestamptz, read_at timestamptz, primary key(message_id,user_id)
);
create table if not exists public.hidden_messages (
 message_id uuid not null references public.messages(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 hidden_at timestamptz not null default now(), primary key(message_id,user_id)
);
create table if not exists public.conversation_typing (
 conversation_id uuid not null references public.conversations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default (now()+interval '5 seconds'), primary key(conversation_id,user_id)
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at desc);
create index if not exists message_reactions_message_idx on public.message_reactions(message_id);
create index if not exists follow_requests_target_status_idx on public.follow_requests(target_id,status,created_at desc);
create index if not exists call_signals_recipient_idx on public.call_signals(recipient_id,conversation_id,created_at);
create index if not exists message_receipts_user_idx on public.message_receipts(user_id,read_at);
create index if not exists hidden_messages_user_idx on public.hidden_messages(user_id,message_id);
create index if not exists conversation_typing_expiry_idx on public.conversation_typing(conversation_id,expires_at);

-- A small public-only aggregate view keeps live creator search fast without loading post content.
create or replace view public.profile_search_stats as
select p.id,p.username,p.display_name,p.bio,p.avatar_url,p.created_at,p.is_private,
 (select count(*)::bigint from public.follows f where f.followed_id=p.id) as follower_count,
 (select count(*)::bigint from public.follows f where f.follower_id=p.id) as following_count,
 (select count(*)::bigint from public.posts po where po.user_id=p.id) as post_count
from public.profiles p;
grant select on public.profile_search_stats to anon, authenticated;
create index if not exists conversation_members_user_idx on public.conversation_members(user_id,conversation_id);

alter table public.message_reactions enable row level security;
alter table public.follow_requests enable row level security;
alter table public.call_signals enable row level security;
alter table public.message_receipts enable row level security;
alter table public.hidden_messages enable row level security;
alter table public.conversation_typing enable row level security;

drop policy if exists "Conversation members can see conversations" on public.conversations;
create policy "Conversation members can see conversations" on public.conversations for select to authenticated using (
 exists(select 1 from public.conversation_members m where m.conversation_id=id and m.user_id=auth.uid() and m.left_at is null)
);
drop policy if exists "Users can read their own membership" on public.conversation_members;
create policy "Users can read their own membership" on public.conversation_members for select to authenticated using (user_id=auth.uid());
drop policy if exists "Conversation members can read messages" on public.messages;
create policy "Conversation members can read messages" on public.messages for select to authenticated using (
 exists(select 1 from public.conversation_members m where m.conversation_id=messages.conversation_id and m.user_id=auth.uid() and m.left_at is null and (m.cleared_at is null or messages.created_at>m.cleared_at))
);
drop policy if exists "Conversation members can send messages" on public.messages;
create policy "Conversation members can send messages" on public.messages for insert to authenticated with check (
 sender_id=auth.uid() and exists(select 1 from public.conversation_members m where m.conversation_id=messages.conversation_id and m.user_id=auth.uid() and m.left_at is null)
);
drop policy if exists "Members read reactions for visible messages" on public.message_reactions;
create policy "Members read reactions for visible messages" on public.message_reactions for select to authenticated using (
 exists(select 1 from public.messages x join public.conversation_members m on m.conversation_id=x.conversation_id where x.id=message_id and m.user_id=auth.uid() and m.left_at is null)
);
drop policy if exists "Members add own message reactions" on public.message_reactions;
create policy "Members add own message reactions" on public.message_reactions for insert to authenticated with check (
 user_id=auth.uid() and exists(select 1 from public.messages x join public.conversation_members m on m.conversation_id=x.conversation_id where x.id=message_id and m.user_id=auth.uid() and m.left_at is null)
);
drop policy if exists "Users remove own message reactions" on public.message_reactions;
create policy "Users remove own message reactions" on public.message_reactions for delete to authenticated using (user_id=auth.uid());
drop policy if exists "Users read follow requests they are part of" on public.follow_requests;
create policy "Users read follow requests they are part of" on public.follow_requests for select to authenticated using (requester_id=auth.uid() or target_id=auth.uid());
drop policy if exists "Users create own follow requests" on public.follow_requests;
create policy "Users create own follow requests" on public.follow_requests for insert to authenticated with check (requester_id=auth.uid() and exists(select 1 from public.profiles p where p.id=target_id and p.is_private=true));
drop policy if exists "Targets update follow requests" on public.follow_requests;
create policy "Targets update follow requests" on public.follow_requests for update to authenticated using (target_id=auth.uid()) with check (target_id=auth.uid());
-- Do not let a client bypass private-account approval by inserting a follows row directly.
drop policy if exists "Users manage own follows" on public.follows;
drop policy if exists "Users follow public or approved private accounts" on public.follows;
create policy "Users follow public or approved private accounts" on public.follows for insert to authenticated with check (
 follower_id=auth.uid() and exists(select 1 from public.profiles p where p.id=followed_id and (p.is_private=false or exists(select 1 from public.follow_requests r where r.requester_id=auth.uid() and r.target_id=p.id and r.status='approved')))
);
drop policy if exists "Users unfollow own accounts" on public.follows;
create policy "Users unfollow own accounts" on public.follows for delete to authenticated using (follower_id=auth.uid());
drop policy if exists "Call participants read their signals" on public.call_signals;
create policy "Call participants read their signals" on public.call_signals for select to authenticated using (sender_id=auth.uid() or recipient_id=auth.uid());
drop policy if exists "Members send call signals" on public.call_signals;
create policy "Members send call signals" on public.call_signals for insert to authenticated with check (
 sender_id=auth.uid() and exists(select 1 from public.conversation_members m where m.conversation_id=call_signals.conversation_id and m.user_id=auth.uid() and m.left_at is null)
);
drop policy if exists "Recipients consume call signals" on public.call_signals;
create policy "Recipients consume call signals" on public.call_signals for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());
drop policy if exists "Users read own message receipts" on public.message_receipts;
create policy "Users read own message receipts" on public.message_receipts for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.messages x join public.conversation_members m on m.conversation_id=x.conversation_id where x.id=message_id and x.sender_id=auth.uid() and m.user_id=message_receipts.user_id));
drop policy if exists "Users update own message receipts" on public.message_receipts;
create policy "Users update own message receipts" on public.message_receipts for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "Users manage their hidden messages" on public.hidden_messages;
create policy "Users manage their hidden messages" on public.hidden_messages for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "Members read typing status" on public.conversation_typing;
create policy "Members read typing status" on public.conversation_typing for select to authenticated using (exists(select 1 from public.conversation_members m where m.conversation_id=conversation_typing.conversation_id and m.user_id=auth.uid() and m.left_at is null));
drop policy if exists "Members update own typing status" on public.conversation_typing;
create policy "Members update own typing status" on public.conversation_typing for all to authenticated using (user_id=auth.uid() and exists(select 1 from public.conversation_members m where m.conversation_id=conversation_typing.conversation_id and m.user_id=auth.uid() and m.left_at is null)) with check (user_id=auth.uid() and exists(select 1 from public.conversation_members m where m.conversation_id=conversation_typing.conversation_id and m.user_id=auth.uid() and m.left_at is null));

-- Private profiles: direct-table post reads require public profile or approved follower or owner.
drop policy if exists "Public posts are readable" on public.posts;
drop policy if exists "Posts are readable under account privacy" on public.posts;
create policy "Posts are readable under account privacy" on public.posts for select to anon, authenticated using (
 (visibility='public' and exists(select 1 from public.profiles p where p.id=user_id and (p.is_private=false or p.id=auth.uid() or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=p.id))))
 or user_id=auth.uid()
 or (visibility='followers' and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=user_id))
);
-- Private accounts also gate Stories marked public.
drop policy if exists "Visible active stories are readable" on public.stories;
create policy "Visible active stories are readable" on public.stories for select to anon, authenticated using (
 expires_at>now() and (
  user_id=auth.uid() or
  (visibility='public' and exists(select 1 from public.profiles p where p.id=user_id and (p.is_private=false or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=p.id)))) or
  (visibility='followers' and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=user_id))
 )
);
-- Storage supports message attachments including audio/voice and common office documents.
update storage.buckets set file_size_limit=52428800,
 allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','application/pdf','text/plain','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
where id='vybe-media';

commit;
