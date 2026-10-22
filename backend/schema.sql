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
