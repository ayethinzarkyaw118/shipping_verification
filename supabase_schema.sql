

create table if not exists email_results (
    email_id text primary key,
    category text not null,
    mismatch_found boolean,
    mismatches jsonb default '[]',
    summary text,
    needs_review boolean default false,
    created_at timestamptz default now()
);

create table if not exists review_queue (
    email_id text primary key references email_results(email_id),
    reason text not null,
    detail text,
    resolved boolean default false,
    created_at timestamptz default now()
);
