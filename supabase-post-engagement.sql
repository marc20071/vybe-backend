
-- =========================================================
-- VYBE: POST VIEWS AND REPOSTS
-- Run after the main VYBE database schema.
-- =========================================================

-- 1. Unique post views
create table if not exists public.post_views (
  post_id uuid not null
    references public.posts(id) on delete cascade,
  viewer_id uuid not null
    references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id)
);

-- 2. Unique reposts
create table if not exists public.post_reposts (
  post_id uuid not null
    references public.posts(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 3. Indexes
create index if not exists post_views_post_idx
  on public.post_views(post_id);

create index if not exists post_reposts_post_created_idx
  on public.post_reposts(post_id, created_at desc);

create index if not exists post_reposts_user_created_idx
  on public.post_reposts(user_id, created_at desc);

-- 4. Enable RLS
alter table public.post_views enable row level security;
alter table public.post_reposts enable row level security;

-- 5. Permissions
grant select, insert
  on public.post_views
  to authenticated;

grant select, insert, delete
  on public.post_reposts
  to authenticated;

-- 6. Post view policies
drop policy if exists "Users read own post views"
  on public.post_views;

create policy "Users read own post views"
on public.post_views
for select
to authenticated
using (viewer_id = auth.uid());

drop policy if exists "Users record own post views"
  on public.post_views;

create policy "Users record own post views"
on public.post_views
for insert
to authenticated
with check (
  viewer_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.visibility = 'public'
      and p.user_id <> auth.uid()
  )
);

-- 7. Repost policies
drop policy if exists "Users read own reposts"
  on public.post_reposts;

create policy "Users read own reposts"
on public.post_reposts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users create own reposts"
  on public.post_reposts;

create policy "Users create own reposts"
on public.post_reposts
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.visibility = 'public'
      and p.user_id <> auth.uid()
  )
);

drop policy if exists "Users delete own reposts"
  on public.post_reposts;

create policy "Users delete own reposts"
on public.post_reposts
for delete
to authenticated
using (user_id = auth.uid());
