-- Post service schema (MVP)
-- Run this in Supabase SQL editor (adjust schema if you use a non-public schema).

create extension if not exists pgcrypto;

create table if not exists public.posts (
    id uuid primary key default gen_random_uuid(),
    type text not null,
    title text,
    summary text,
    author_id uuid,
    status text not null default 'draft',
    expires_at timestamptz,
    pinned boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint posts_status_check check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.tags (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    created_at timestamptz not null default now()
);

create table if not exists public.post_tags (
    post_id uuid not null references public.posts(id) on delete cascade,
    tag_id uuid not null references public.tags(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (post_id, tag_id)
);

create table if not exists public.post_refs (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.posts(id) on delete cascade,
    service text not null,
    entity_id text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_posts_status_created_at
    on public.posts (status, created_at desc);

create index if not exists idx_posts_pinned_created_at
    on public.posts (pinned desc, created_at desc);

create index if not exists idx_posts_expires_at
    on public.posts (expires_at);

create index if not exists idx_posts_author_id
    on public.posts (author_id);

create index if not exists idx_tags_name
    on public.tags (name);

create index if not exists idx_post_tags_tag_id
    on public.post_tags (tag_id);

create index if not exists idx_post_refs_post_id
    on public.post_refs (post_id);
