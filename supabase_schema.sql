

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

-- Optional: enable row level security and allow the service role full access.
-- The backend uses the service_role key, which bypasses RLS by default, so
-- this is only needed if you also want to query these tables from a frontend
-- using the anon key.
-- alter table email_results enable row level security;
-- alter table review_queue enable row level security;
