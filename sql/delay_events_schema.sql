create table if not exists public.delay_events (
    id uuid primary key,

    tenant_id uuid not null,
    project_id uuid not null,

    event_reference text not null,
    event_title text not null,
    event_description text,
    delay_category text,

    event_date date not null,
    knowledge_date date not null,

    responsible_party text,
    contract_clause text,

    notice_required boolean not null default true,
    notice_period_days integer,
    notice_deadline date,
    time_bar_status text,

    schedule_id uuid,
    engine2_analysis_id uuid,

    gross_delay_days numeric,
    concurrent_delay_days numeric,
    net_delay_days numeric,

    status text not null default 'OPEN',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


create index if not exists idx_delay_events_project
    on public.delay_events(project_id);


create index if not exists idx_delay_events_tenant_project
    on public.delay_events(
        tenant_id,
        project_id
    );


create index if not exists idx_delay_events_notice_deadline
    on public.delay_events(
        notice_deadline
    );


alter table public.delay_events
enable row level security;


-- IMPORTANT:
--
-- Add project-membership RLS policies consistent with the
-- existing ContractX project_users / tenant isolation model
-- before production use.