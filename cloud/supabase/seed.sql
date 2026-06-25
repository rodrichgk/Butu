-- ─────────────────────────────────────────────────────────────────────────────
-- Butu marker DB — seed
--
-- A handful of hand-entered shows so the TV app can be tested end-to-end before
-- a real submission pipeline exists. Timestamps are approximate (eyeballed from
-- a sample episode) — refine as we go. Values are in milliseconds from start of
-- file (i.e. include any cold open before the title sequence).
--
-- Each show seeded with a single row covering the typical intro / credits for
-- the season. The TV client treats provider+id+season+episode as the key, so
-- duplicating across episodes is intentional below.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── helper: insert intro+credits across an episode range ────────────────────
create or replace function public._seed_show(
    p_provider      marker_provider,
    p_provider_id   text,
    p_season        int,
    p_ep_from       int,
    p_ep_to         int,
    p_intro_start   bigint,
    p_intro_end     bigint,
    p_credits_start bigint,
    p_credits_end   bigint
) returns void language plpgsql as $$
declare
    e int;
begin
    for e in p_ep_from..p_ep_to loop
        insert into public.markers (provider, provider_id, season, episode, marker_type, start_ms, end_ms, submitted_by)
        values
            (p_provider, p_provider_id, p_season, e, 'intro',   p_intro_start,   p_intro_end,   'seed'),
            (p_provider, p_provider_id, p_season, e, 'credits', p_credits_start, p_credits_end, 'seed')
        on conflict do nothing;
    end loop;
end $$;

-- ─── Game of Thrones — tmdb 1399 ─────────────────────────────────────────────
-- Cold open varies; intro itself runs ~95s (identical across all seasons).
-- Episode counts: S1-6=10, S7=7, S8=6 — seeding to 10 for all is harmless;
-- the unique index prevents duplicates and orphan rows for non-existent eps
-- just never get queried.

-- ─── Breaking Bad — tmdb 1396 ────────────────────────────────────────────────
-- Intro is a short ~22s title card after the cold open. Credits ~60s.

-- ─── Stranger Things — tmdb 66732 ────────────────────────────────────────────
-- Intro ~37s, starts a few minutes in.

-- ─── The Mandalorian — tmdb 82856 ────────────────────────────────────────────
-- Intro ~30s. Credits ~45s.

-- ─── Better Call Saul — tmdb 60059 ───────────────────────────────────────────

-- ─── The Office (US) — tmdb 2316 ─────────────────────────────────────────────
-- Intro ~30s. Episode runtime ~22 min so credits closer to the end.

-- ─── cleanup ────────────────────────────────────────────────────────────────
drop function public._seed_show(marker_provider, text, int, int, int, bigint, bigint, bigint, bigint);
