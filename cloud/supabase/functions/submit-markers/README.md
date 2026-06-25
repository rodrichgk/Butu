# submit-markers — Edge Function

The single public write path for the Butu marker DB. The companion Tauri app
POSTs detected markers here; the function validates, rate-limits, and INSERTs
with `service_role` to bypass RLS.

## Deploy

You need the Supabase CLI installed (`npm i -g supabase` or
`brew install supabase/tap/supabase`).

```bash
# from repo root
cd cloud

# one-time: link this directory to your hosted project
supabase login
supabase link --project-ref <your-project-ref>   # the 'jfztdnbmikoxcdrqjonl' part

# set the service role secret (replace with your actual sb_secret key)
supabase secrets set BUTU_SERVICE_ROLE_KEY=sb_secret_xxxxxxxx

# deploy
supabase functions deploy submit-markers
```

After deploy, the function lives at:

```
https://<project>.supabase.co/functions/v1/submit-markers
```

## Test from curl

```bash
curl -X POST https://<project>.supabase.co/functions/v1/submit-markers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -d '{
    "submitted_by": "test",
    "source": "manual-curl",
    "episodes": [{
      "provider": "tmdb",
      "provider_id": "1399",
      "season": 4,
      "episode": 1,
      "duration_ms": 3600000,
      "markers": [
        { "marker_type": "intro",   "start_ms": 90000,   "end_ms": 195000 },
        { "marker_type": "credits", "start_ms": 3300000, "end_ms": 3350000 }
      ]
    }]
  }'
```

Successful response: `{ "inserted": 2 }`. Duplicate response (already submitted by
this contributor for this episode): `{ "inserted": 0, "note": "duplicate — already submitted" }`.

## Body shape

```ts
interface Submission {
  submitted_by?: string;  // free-form contributor id, defaults to "auto"
  source?: string;        // app+version e.g. "butu-companion/0.1.0"
  episodes: {
    provider: "tmdb" | "tvdb" | "imdb";
    provider_id: string;     // "1399" or "tt0903747"
    season: number | null;   // null for movies
    episode: number | null;  // null for movies
    duration_ms?: number;    // sanity check vs marker end_ms
    markers: {
      marker_type: "intro" | "credits";
      start_ms: number;
      end_ms: number;        // must exceed start_ms
    }[];
  }[];
}
```

## Validation rules

- ≤ 500 episodes per submission (prevents accidental library-wide spam in one call)
- intro span ≤ 5 min, credits span ≤ 10 min
- marker `end_ms ≤ episode.duration_ms` when duration is supplied
- season ∈ [0, 100], episode ∈ [0, 1000]

## Rate limit

50 submissions per IP per 60 s. In-memory only — cold starts reset the window.

## Permissions

The TV/anon clients never call this function directly — they only `GET` from
`/rest/v1/markers`. The companion app sends a normal `Authorization: Bearer
<anon_key>` to authenticate the *function call* (Supabase requires it), then
the function uses `BUTU_SERVICE_ROLE_KEY` internally for the DB write.
