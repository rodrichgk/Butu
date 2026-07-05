import { useQuery } from "@tanstack/react-query";
import { useConfigStore } from "../store/useConfigStore";
import { fetchPlexEpisodes, plexRawToEpisode } from "../services/plexApi";
import type { MediaItem, Episode } from "../types";

export function useEpisodesQuery(item: MediaItem) {
  const plexConfig = useConfigStore((s) => s.plexConfig);

  const isPlexShow =
    (item.type === "tv" || item.type === "anime") &&
    item.plexKey &&
    plexConfig &&
    !item.episodes?.length;

  return useQuery<Episode[]>({
    queryKey: ["episodes", item.id, plexConfig?.serverUrl],
    queryFn: async () => {
      if (isPlexShow && plexConfig) {
        const raws = await fetchPlexEpisodes(plexConfig, `/library/metadata/${item.id}`);
        return raws.map((r) => plexRawToEpisode(r, plexConfig));
      }
      return item.episodes ?? [];
    },
    enabled: !!isPlexShow && !!plexConfig,
    initialData: item.episodes ?? undefined,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
