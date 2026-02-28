-- Job service schema additions for job applications and job notifications.
-- Run this in Supabase SQL editor before using the job-service endpoints.

create extension if not exists pgcrypto;

create table if not exists public.job_applications (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.posts(id) on delete cascade,
    post_author_id uuid not null references public.users(id) on delete cascade,
    applicant_user_id uuid not null references public.users(id) on delete cascade,
    applicant_name text not null,
    student_id text not null,
    current_year text not null,
    description text not null,
    contact_information text not null,
    cv_file_name text not null,
    cv_file_type text,
    cv_file_size integer,
    cv_file_data_url text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint job_applications_no_self_apply check (post_author_id <> applicant_user_id)
);

create index if not exists idx_job_applications_post_created
    on public.job_applications (post_id, created_at desc);

create index if not exists idx_job_applications_author_created
    on public.job_applications (post_author_id, created_at desc);

create index if not exists idx_job_applications_applicant_created
    on public.job_applications (applicant_user_id, created_at desc);

create table if not exists public.job_application_notifications (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null unique references public.job_applications(id) on delete cascade,
    recipient_user_id uuid not null references public.users(id) on delete cascade,
    post_id uuid not null references public.posts(id) on delete cascade,
    applicant_name text not null,
    job_title text,
    company_name text,
    is_read boolean not null default false,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_job_notifications_recipient_read_created
    on public.job_application_notifications (recipient_user_id, is_read, created_at desc);
