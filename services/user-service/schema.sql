-- User service schema additions for alumni verification workflow.
-- Run this in Supabase SQL editor before using the verification endpoints.

create extension if not exists pgcrypto;

create table if not exists public.alumni_verification_applications (
    id uuid primary key default gen_random_uuid(),
    applicant_id uuid not null references public.users(id) on delete cascade,
    student_id text not null,
    id_card_image_data_url text not null,
    current_job_info text not null,
    status text not null default 'pending',
    review_note text,
    reviewed_by uuid references public.users(id) on delete set null,
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint alumni_verification_status_check
        check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists idx_alumni_verification_applicant
    on public.alumni_verification_applications (applicant_id, created_at desc);

create index if not exists idx_alumni_verification_status
    on public.alumni_verification_applications (status, created_at desc);
