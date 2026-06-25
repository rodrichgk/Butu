import { MediaItem, Episode } from "../types";

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface CloudMarker {
  type: "intro" | "credits";
  startMs: number;
  endMs: number;
}

export async function fetchCloudMarkers(item: MediaItem, ep?: Episode): Promise<CloudMarker[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return [];
  }
  
  // figure out provider and id
  const extIds = ep?.externalIds?.length ? ep.externalIds : item.externalIds || [];
  let provider = "";
  let providerId = "";

  for (const id of extIds) {
    if (id.startsWith("tmdb://")) {
      provider = "tmdb";
      providerId = id.replace("tmdb://", "");
      break;
    }
    if (id.startsWith("tvdb://")) {
      provider = "tvdb";
      providerId = id.replace("tvdb://", "");
      break;
    }
    if (id.startsWith("imdb://")) {
      provider = "imdb";
      providerId = id.replace("imdb://", "");
      break;
    }
  }

  if (!provider || !providerId) {
    return [];
  }

  const season = ep?.season ?? item.season ?? 1;
  const episode = ep?.episode ?? item.episode ?? 1;

  try {
    const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/markers`);
    url.searchParams.set("select", "marker_type,start_ms,end_ms");
    url.searchParams.set("provider", `eq.${provider}`);
    url.searchParams.set("provider_id", `eq.${providerId}`);
    url.searchParams.set("season", `eq.${season}`);
    url.searchParams.set("episode", `eq.${episode}`);

    const res = await fetch(url.toString(), {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!res.ok) {
      console.error("fetchCloudMarkers failed", await res.text());
      return [];
    }

    const rows = await res.json();
    return rows.map((row: any) => ({
      type: row.marker_type,
      startMs: row.start_ms,
      endMs: row.end_ms
    }));
  } catch (err) {
    console.error("fetchCloudMarkers threw error", err);
    return [];
  }
}
