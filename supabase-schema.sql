-- Apply in Supabase SQL Editor. Review RLS policies before production use.
create extension if not exists pgcrypto;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null check (char_length(username) between 3 and 30),
 display_name text not null default '', bio text not null default '', avatar_url text,
 created_at timestamptz not null default now()
);
create table if not exists public.media (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null, public_url text, media_type text not null check (media_type in ('image','video')),
 mime_type text, size_bytes bigint, created_at timestamptz not null default now()
);
create table if not exists public.posts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 media_id uuid references public.media(id) on delete set null, caption text not null default '', media_url text,
 media_type text not null default 'image', visibility text not null default 'public' check (visibility in ('public','followers','private')),
 created_at timestamptz not null default now()
);
create table if not exists public.comments (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, body text not null check (char_length(body) between 1 and 2000), created_at timestamptz not null default now()
);
create table if not exists public.reactions (
 user_id uuid not null references auth.users(id) on delete cascade, post_id uuid not null references public.posts(id) on delete cascade,
 kind text not null default 'like' check (kind in ('like','save')), created_at timestamptz not null default now(), primary key(user_id,post_id,kind)
);
create table if not exists public.follows (
 follower_id uuid not null references auth.users(id) on delete cascade, followed_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(follower_id,followed_id), check (follower_id <> followed_id)
);
create table if not exists public.stories (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 media_id uuid references public.media(id) on delete set null, media_url text not null, created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '24 hours'
);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
 conversation_id uuid not null references public.conversations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 primary key(conversation_id,user_id)
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade, body text not null check (char_length(body) between 1 and 5000), created_at timestamptz not null default now()
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null, type text not null, message text not null, read_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references auth.users(id) on delete cascade,
 target_type text not null, target_id uuid not null, reason text not null, details text not null default '', status text not null default 'pending', created_at timestamptz not null default now()
);
create index if not exists posts_public_created_idx on public.posts(visibility,created_at desc);
create index if not exists comments_post_created_idx on public.comments(post_id,created_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at desc);
-- Enable RLS; service backend uses the caller's verified JWT for normal queries.
alter table public.profiles enable row level security;
alter table public.media enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.follows enable row level security;
alter table public.stories enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
-- Policies intentionally not auto-created here: use backend-mediated access and add reviewed policies before production.

-- Create a private media bucket. Signed URLs are generated only after the backend checks visibility.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('vybe-media','vybe-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update set public=false, file_size_limit=52428800;
-- Authenticated users can upload only inside their own UUID-named directory.
create policy "Users upload to their own VYBE folder" on storage.objects for insert to authenticated
with check (bucket_id='vybe-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users manage their own VYBE media" on storage.objects for delete to authenticated
using (bucket_id='vybe-media' and (storage.foldername(name))[1]=auth.uid()::text);
-- Read policies used by the frontend/API. Writes are restricted to the authenticated owner.
create policy "Profiles are readable" on public.profiles for select to anon, authenticated using (true);
create policy "Users insert own profile" on public.profiles for insert to authenticated with check (id=auth.uid());
create policy "Users update own profile" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy "Users read own media metadata" on public.media for select to authenticated using (user_id=auth.uid());
create policy "Users insert own media metadata" on public.media for insert to authenticated with check (user_id=auth.uid());
create policy "Public posts are readable" on public.posts for select to anon, authenticated using (visibility='public' or user_id=auth.uid());
create policy "Users create own posts" on public.posts for insert to authenticated with check (user_id=auth.uid());
create policy "Users delete own posts" on public.posts for delete to authenticated using (user_id=auth.uid());
create policy "Comments on public posts are readable" on public.comments for select to anon, authenticated using (exists(select 1 from public.posts p where p.id=post_id and p.visibility='public'));
create policy "Users create own comments" on public.comments for insert to authenticated with check (user_id=auth.uid());
create policy "Users delete own comments" on public.comments for delete to authenticated using (user_id=auth.uid());
create policy "Reactions are readable by authenticated users" on public.reactions for select to authenticated using (true);
create policy "Reactions are readable for counts" on public.reactions for select to anon, authenticated using (true);
create policy "Users manage own reactions" on public.reactions for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "Follows are readable" on public.follows for select to anon, authenticated using (true);
create policy "Users manage own follows" on public.follows for all to authenticated using (follower_id=auth.uid()) with check (follower_id=auth.uid());
create policy "Unexpired stories are readable" on public.stories for select to anon, authenticated using (expires_at>now());
create policy "Users create own stories" on public.stories for insert to authenticated with check (user_id=auth.uid());
create policy "Users delete own stories" on public.stories for delete to authenticated using (user_id=auth.uid());
create policy "Conversation members can see conversations" on public.conversations for select to authenticated using (exists(select 1 from public.conversation_members m where m.conversation_id=id and m.user_id=auth.uid()));
create policy "Users can read their own membership" on public.conversation_members for select to authenticated using (user_id=auth.uid());
create policy "Conversation members can read messages" on public.messages for select to authenticated using (exists(select 1 from public.conversation_members m where m.conversation_id=conversation_id and m.user_id=auth.uid()));
create policy "Conversation members can send messages" on public.messages for insert to authenticated with check (sender_id=auth.uid() and exists(select 1 from public.conversation_members m where m.conversation_id=conversation_id and m.user_id=auth.uid()));
create policy "Users read own notifications" on public.notifications for select to authenticated using (user_id=auth.uid());
create policy "Users update own notifications" on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "Users create own reports" on public.reports for insert to authenticated with check (reporter_id=auth.uid());
create policy "Users read own reports" on public.reports for select to authenticated using (reporter_id=auth.uid());
-- Create a profile after auth signup using metadata from the signup form.
create or replace function public.handle_new_vybe_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,username,display_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'username','user_'||substr(new.id::text,1,8)), coalesce(new.raw_user_meta_data->>'display_name',''))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_vybe_user_created on auth.users;
create trigger on_vybe_user_created after insert on auth.users for each row execute procedure public.handle_new_vybe_user();
