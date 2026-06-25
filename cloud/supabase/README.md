# Butu marker DB — Supabase

This directory holds the SQL for the crowdsourced intro/credits database that
backs `CloudMarkerSource` in the TV client. The contract is just PostgREST:
the TV app hits `/rest/v1/markers` directly with the anon key — no edge
function or server code in between.

## Files

- `schema.sql` — tables, indexes, RLS, the `markers` table.
- `seed.sql`   — a handful of hand-entered shows so the player can be exercised
                end-to-end before crowdsourcing exists.

## Setup

1. Create a project at https://supabase.com (free tier is fine to start).
2. **SQL editor → New query** → paste `schema.sql` → run.
3. **SQL editor → New query** → paste `seed.sql` → run.
4. **Project Settings → API**, copy:
   - `Project URL` (e.g. `https://abcdefg.supabase.co`)
   - `anon` public key (a long `eyJhbGciOi...` JWT)
5. Add them to the repo's `.env` (see `.env.example`):
   ```
   SUPABASE_URL=https://abcdefg.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
6. Rebuild the Android app — `app/build.gradle.kts` reads `.env` at configure
   time and bakes those values into `BuildConfig`.

## Schema at a glance

```
markers(
    id           uuid pk
    provider     enum('tmdb','tvdb','imdb')
    provider_id  text                          -- "1396" for tmdb, "tt0903747" for imdb
    season       int  null                     -- null for movies
    episode      int  null
    marker_type  enum('intro','credits')
    start_ms     bigint
    end_ms       bigint
    duration_ms  bigint null                   -- sanity check vs episode length
    confidence   real default 1.0              -- for future weighted crowdsource
    submitted_by text null                     -- 'seed' for seeded rows
    note         text null
    created_at   timestamptz
    updated_at   timestamptz
)
```

- Index on `(provider, provider_id, season, episode)` — the only lookup pattern.
- RLS: anyone (anon role) can `select`; only `authenticated` can `insert`.
  Seeded rows are written by `service_role` from the SQL editor, which bypasses
  RLS by design.

## How the TV client queries it

A single GET, keyed by what Plex/Jellyfin handed us via the `<Guid>` /
`ProviderIds` data:

```
GET /rest/v1/markers
    ?provider=eq.tmdb
    &provider_id=eq.1399
    &season=eq.1
    &episode=eq.1
    &select=marker_type,start_ms,end_ms
Headers:
    apikey: <SUPABASE_ANON_KEY>
    Authorization: Bearer <SUPABASE_ANON_KEY>
```

Response is `[{"marker_type":"intro","start_ms":90000,"end_ms":195000}, ...]`,
which `SupabaseMarkerSource` maps to `domain.Marker` and hands back to
`PlayerViewModel`. Empty response → no fallback markers, no Skip pill shown.

## Adding new shows (manual, pre-crowdsource)

Until the companion app exists, use the SQL editor:

```sql
insert into public.markers
    (provider, provider_id, season, episode, marker_type, start_ms, end_ms, submitted_by)
values
    ('tmdb', '94997', 1, 1, 'intro',    60000,   90000, 'manual'),
    ('tmdb', '94997', 1, 1, 'credits', 3200000, 3260000, 'manual');
```

To find a TMDB id, search at https://www.themoviedb.org and copy from the URL.

## Next steps (not in this PR)

- Companion Tauri desktop app: pull a Plex/Jellyfin library, let the user scrub
  to intro/credits markers, POST back via an edge function that signs with a
  per-user key.
- Crowdsource aggregation: median across submitters, weight by `confidence`,
  reject outliers.
