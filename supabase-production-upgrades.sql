-- VYBE additive production upgrade. Run after supabase-schema.sql.
-- Review Supabase Auth redirect URLs and Storage policies before deploying.

alter table public.stories alter column media_url drop not null;
alter table public.stories add column if not exists story_type text not null default 'image' check (story_type in ('text','image','video'));
update public.stories set story_type='video' where story_type='image' and media_url ~* '\.(mp4|webm)(\?|$)';
alter table public.stories add column if not exists text_content text not null default '';
alter table public.stories add column if not exists text_style jsonb not null default '{}'::jsonb;
alter table public.stories add column if not exists music_provider text;
alter table public.stories add column if not exists music_track_id text;
alter table public.stories add column if not exists music_title text;
alter table public.stories add column if not exists music_artist text;
alter table public.stories add column if not exists music_audio_url text;
alter table public.stories add column if not exists music_license_url text;
alter table public.stories add column if not exists music_image_url text;
alter table public.stories add column if not exists music_start_seconds integer not null default 0 check (music_start_seconds >= 0);
alter table public.stories add column if not exists music_duration_seconds integer not null default 15 check (music_duration_seconds between 1 and 60);
alter table public.stories add column if not exists original_audio_muted boolean not null default false;
alter table public.stories add column if not exists music_volume numeric not null default 0.8 check (music_volume between 0 and 1);
alter table public.stories add column if not exists original_volume numeric not null default 1 check (original_volume between 0 and 1);
alter table public.stories add column if not exists visibility text not null default 'public' check (visibility in ('public','followers','private'));

create table if not exists public.story_likes (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(story_id,user_id)
);
create table if not exists public.story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key(story_id,viewer_id)
);
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists stories_expiry_idx on public.stories(expires_at desc);
create index if not exists story_comments_story_created_idx on public.story_comments(story_id,created_at desc);
create index if not exists story_views_story_idx on public.story_views(story_id);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);

alter table public.story_likes enable row level security;
alter table public.story_comments enable row level security;
alter table public.story_views enable row level security;
alter table public.user_blocks enable row level security;

-- Drop-and-create by known names makes this additive migration rerunnable.
drop policy if exists "Story likes are readable" on public.story_likes;
create policy "Story likes are readable" on public.story_likes for select to anon, authenticated using (exists(select 1 from public.stories s where s.id=story_id and s.expires_at>now()));
drop policy if exists "Users manage own story likes" on public.story_likes;
create policy "Users manage own story likes" on public.story_likes for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "Comments on active stories are readable" on public.story_comments;
create policy "Comments on active stories are readable" on public.story_comments for select to anon, authenticated using (exists(select 1 from public.stories s where s.id=story_id and s.expires_at>now()));
drop policy if exists "Authenticated users comment on active stories" on public.story_comments;
create policy "Authenticated users comment on active stories" on public.story_comments for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.stories s where s.id=story_id and s.expires_at>now()));
drop policy if exists "Users delete own story comments" on public.story_comments;
create policy "Users delete own story comments" on public.story_comments for delete to authenticated using (user_id=auth.uid());
drop policy if exists "Story views visible to owner or viewer" on public.story_views;
create policy "Story views visible to owner or viewer" on public.story_views for select to authenticated using (viewer_id=auth.uid() or exists(select 1 from public.stories s where s.id=story_id and s.user_id=auth.uid()));
drop policy if exists "Users record own story views" on public.story_views;
create policy "Users record own story views" on public.story_views for insert to authenticated with check (viewer_id=auth.uid());
drop policy if exists "Users update own story views" on public.story_views;
create policy "Users update own story views" on public.story_views for update to authenticated using (viewer_id=auth.uid()) with check (viewer_id=auth.uid());
drop policy if exists "Users read blocks they created" on public.user_blocks;
create policy "Users read blocks they created" on public.user_blocks for select to authenticated using (blocker_id=auth.uid());
drop policy if exists "Users create own blocks" on public.user_blocks;
create policy "Users create own blocks" on public.user_blocks for insert to authenticated with check (blocker_id=auth.uid());
drop policy if exists "Users delete own blocks" on public.user_blocks;
create policy "Users delete own blocks" on public.user_blocks for delete to authenticated using (blocker_id=auth.uid());
drop policy if exists "Users update own stories" on public.stories;
create policy "Users update own stories" on public.stories for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Restrict authenticated users from reading or creating interactions with blocked users in API logic too.
-- These policies are defense-in-depth; the service layer must also check both block directions.

-- Replace the broad original Story read policy so direct anon-key queries cannot expose private/followers-only Stories.
drop policy if exists "Unexpired stories are readable" on public.stories;
create policy "Visible active stories are readable" on public.stories for select to anon, authenticated using (
  expires_at > now() and (
    visibility = 'public' or user_id = auth.uid() or
    (visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = user_id
    ))
  )
);
drop policy if exists "Story likes are readable" on public.story_likes;
create policy "Story likes are readable" on public.story_likes for select to anon, authenticated using (
  exists(select 1 from public.stories s where s.id=story_id and s.expires_at>now() and (s.visibility='public' or s.user_id=auth.uid() or (s.visibility='followers' and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=s.user_id))))
);
drop policy if exists "Comments on active stories are readable" on public.story_comments;
create policy "Comments on active stories are readable" on public.story_comments for select to anon, authenticated using (
  exists(select 1 from public.stories s where s.id=story_id and s.expires_at>now() and (s.visibility='public' or s.user_id=auth.uid() or (s.visibility='followers' and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=s.user_id))))
);

-- Tighten direct-table writes so a caller cannot like/comment/view a Story they cannot see.
drop policy if exists "Users manage own story likes" on public.story_likes;
drop policy if exists "Users create own story likes on visible stories" on public.story_likes;
create policy "Users create own story likes on visible stories" on public.story_likes for insert to authenticated with check (
  user_id=auth.uid() and exists(select 1 from public.stories s where s.id=story_id and s.expires_at>now() and (s.visibility='public' or s.user_id=auth.uid() or (s.visibility='followers' and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=s.user_id))))
);
drop policy if exists "Users delete own story likes" on public.story_likes;
create policy "Users delete own story likes" on public.story_likes for delete to authenticated using (user_id=auth.uid());
drop policy if exists "Users record own story views" on public.story_views;
create policy "Users record own story views" on public.story_views for insert to authenticated with check (
  viewer_id=auth.uid() and exists(select 1 from public.stories s where s.id=story_id and s.expires_at>now() and (s.visibility='public' or s.user_id=auth.uid() or (s.visibility='followers' and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=s.user_id))))
);
drop policy if exists "Authenticated users comment on active stories" on public.story_comments;
create policy "Authenticated users comment on active stories" on public.story_comments for insert to authenticated with check (
  user_id=auth.uid() and exists(select 1 from public.stories s where s.id=story_id and s.expires_at>now() and (s.visibility='public' or s.user_id=auth.uid() or (s.visibility='followers' and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=s.user_id))))
);
drop policy if exists "Users update own story likes on visible stories" on public.story_likes;
create policy "Users update own story likes on visible stories" on public.story_likes for update to authenticated using (user_id=auth.uid()) with check (
  user_id=auth.uid() and exists(select 1 from public.stories s where s.id=story_id and s.expires_at>now() and (s.visibility='public' or s.user_id=auth.uid() or (s.visibility='followers' and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=s.user_id))))
);

-- VYBE privacy preferences and group/message feature foundations (run after supabase-schema.sql).
alter table public.profiles add column if not exists is_private boolean not null default false;
alter table public.profiles add column if not exists message_privacy text not null default 'everyone'
  check (message_privacy in ('everyone','followers','nobody'));
alter table public.conversations add column if not exists kind text not null default 'direct'
  check (kind in ('direct','group'));
alter table public.conversations add column if not exists name text;
alter table public.conversations add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.conversation_members add column if not exists role text not null default 'member'
  check (role in ('admin','member'));
alter table public.conversation_members add column if not exists joined_at timestamptz not null default now();
alter table public.messages add column if not exists message_type text not null default 'text'
  check (message_type in ('text','image','video','file','voice'));
alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_mime_type text;
alter table public.messages add column if not exists attachment_size_bytes bigint;
alter table public.messages add column if not exists deleted_for_everyone_at timestamptz;
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
create index if not exists conversation_members_user_idx on public.conversation_members(user_id, conversation_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
