-- Server-only tables. RLS is on with no policies, so Supabase's public API keys read and write nothing;
-- the backend connects as the postgres role, which bypasses RLS. Safe to run repeatedly.
create table if not exists workspaces (id text primary key, inputs_json text not null);
create table if not exists analyses (
    response_id text primary key, workspace_id text not null references workspaces(id),
    fingerprint text not null, context_json text not null,
    request_json text not null, response_json text not null
);
create index if not exists analyses_fingerprint on analyses(fingerprint);
create index if not exists analyses_workspace_id on analyses(workspace_id);
create table if not exists evo2_preparations (id text primary key, bundle_json text not null);
create table if not exists evo2_nvidia_attempts (
    id text primary key, day text not null, sequence_sha256 text not null,
    status text not null, created_at text not null
);
create index if not exists evo2_nvidia_attempts_day on evo2_nvidia_attempts(day);
create table if not exists evo2_nvidia_cache (id text primary key, value_json text not null);
create table if not exists evo2_nvidia_results (
    id text primary key, value_json text not null, created_at timestamptz not null default clock_timestamp()
);
create table if not exists evo2_nvidia_pause (day text primary key, reason text not null);
create table if not exists proposals (
    id text primary key, received_at text not null, name text not null, email text not null,
    company text not null, plan text not null, proposal text not null
);
alter table workspaces enable row level security;
alter table analyses enable row level security;
alter table evo2_preparations enable row level security;
alter table evo2_nvidia_attempts enable row level security;
alter table evo2_nvidia_cache enable row level security;
alter table evo2_nvidia_results enable row level security;
alter table evo2_nvidia_pause enable row level security;
alter table proposals enable row level security;
create table if not exists accounts (
    id text primary key, username text not null unique, password_hash text not null,
    name text not null, email text not null, company text not null, role text not null
);
-- Only a hash of each session token is stored, so a database read cannot replay sessions.
create table if not exists account_sessions (
    token_sha256 text primary key, account_id text not null references accounts(id) on delete cascade,
    created_at timestamptz not null default clock_timestamp()
);
create table if not exists notifications (
    id bigint generated always as identity primary key, account_id text not null references accounts(id) on delete cascade,
    message text not null, tone text not null, page text not null, at timestamptz not null default clock_timestamp()
);
create index if not exists notifications_account on notifications(account_id, id desc);
-- Per-account UI state by key (sidebar flags today; workspace settings can join later).
create table if not exists account_state (
    account_id text not null references accounts(id) on delete cascade, key text not null,
    value_json jsonb not null, primary key (account_id, key)
);
-- Demo sign-in; the password is shared internally, not kept in the repo.
insert into accounts values ('demo', 'researcher',
    'pbkdf2_sha256$600000$228924d9e5c4d19784709020f5744fe7$5a15067c854c01c7b60494ea728f533006a7da8d18f5b94bb69c42d17fd9d2da',
    'Demo Researcher', 'researcher@example.com', 'Sanguis Biofactory Lab', 'Bioprocess scientist') on conflict do nothing;
alter table accounts enable row level security;
alter table account_sessions enable row level security;
alter table notifications enable row level security;
alter table account_state enable row level security;
