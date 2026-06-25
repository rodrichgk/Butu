-- ─────────────────────────────────────────────────────────────────────────────
-- Butu crowdsourced marker database — schema
--
-- One row per intro / credits marker. Keyed by (provider, provider_id,
-- season, episode). Movies have season = NULL, episode = NULL.
--
-- Apply in the Supabase SQL editor, OR via the CLI:
--     supabase db push    (with this file referenced from supabase/config.toml)
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── enums ───────────────────────────────────────────────────────────────────
do $$ begin
    create type marker_provider as enum ('tmdb', 'tvdb', 'imdb');
exception when duplicate_object then null; end $$;

do $$ begin
    create type marker_kind as enum ('intro', 'credits');
exception when duplicate_object then null; end $$;

-- ─── markers ─────────────────────────────────────────────────────────────────
create table if not exists public.markers (
    id            uuid primary key default gen_random_uuid(),
    provider      marker_provider not null,
    provider_id   text            not null,
    season        int,
    episode       int,
    marker_type   marker_kind     not null,
    start_ms      bigint          not null check (start_ms >= 0),
    end_ms        bigint          not null check (end_ms > start_ms),
    duration_ms   bigint,                          -- optional sanity-check vs. episode length
    confidence    real            not null default 1.0 check (confidence between 0 and 1),
    submitted_by  text,                            -- free-form (anon nickname, plex user, etc.)
    note          text,                            -- optional human notes
    created_at    timestamptz     not null default now(),
    updated_at    timestamptz     not null default now()
);

-- Lookup is always by (provider, provider_id, season, episode).
create index if not exists markers_lookup_idx
    on public.markers (provider, provider_id, season nulls first, episode nulls first);

-- Prevent the same person from inserting two identical marker rows.
-- (Crowdsourcing later can relax this — e.g. average across submitters.)
create unique index if not exists markers_unique_per_submitter
    on public.markers (provider, provider_id, coalesce(season, -1), coalesce(episode, -1), marker_type, coalesce(submitted_by, 'anon'));

-- ─── auto-update updated_at ─────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists markers_touch on public.markers;
create trigger markers_touch before update on public.markers
    for each row execute function public.touch_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Anyone (anon role) can read. Inserts require authenticated role; the public
-- write path goes through the companion app's edge function (added later) so we
-- can rate-limit and de-dup. For now, seed data is inserted by service_role.
alter table public.markers enable row level security;

drop policy if exists "markers_read_all" on public.markers;
create policy "markers_read_all" on public.markers
    for select using (true);

drop policy if exists "markers_authenticated_insert" on public.markers;
create policy "markers_authenticated_insert" on public.markers
    for insert with check (auth.role() = 'authenticated');
