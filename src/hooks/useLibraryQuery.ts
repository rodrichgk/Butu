import { useQuery } from "@tanstack/react-query";
import { useConfigStore } from "../store/useConfigStore";
import { fetchJellyfinLibrary, rawToMediaItem } from "../services/jellyfinApi";
import { fetchPlexSections, fetchPlexSection, plexRawToMediaItem } from "../services/plexApi";
import type { MediaItem } from "../types";
import { describeServerError } from "../utils/errorMessages";

export function useLibraryQuery() {
  const serverType = useConfigStore((s) => s.serverType);
  const jellyfinConfig = useConfigStore((s) => s.jellyfinConfig);
  const plexConfig = useConfigStore((s) => s.plexConfig);

  return useQuery<MediaItem[], Error>({
    queryKey: ["library", serverType, serverType === "jellyfin" ? jellyfinConfig?.serverUrl : plexConfig?.serverUrl],
    queryFn: async () => {
      if (serverType === "jellyfin" && jellyfinConfig) {
        try {
          const rawItems = await fetchJellyfinLibrary(jellyfinConfig);
          return rawItems.map((r) => rawToMediaItem(r, jellyfinConfig));
        } catch (e) {
          throw new Error(describeServerError(e, "jellyfin"));
        }
      } else if (serverType === "plex" && plexConfig) {
        try {
          const sections = await fetchPlexSections(plexConfig);
          const allMedia: MediaItem[] = [];
          for (const s of sections) {
            if (s.type === "movie" || s.type === "show") {
              const rawItems = await fetchPlexSection(plexConfig, s.key);
              for (const raw of rawItems) {
                allMedia.push(plexRawToMediaItem(raw, plexConfig));
              }
            }
          }
          return allMedia;
        } catch (e) {
          throw new Error(describeServerError(e, "plex"));
        }
      }
      return [];
    },
    enabled: !!serverType && (
      (serverType === "jellyfin" && !!jellyfinConfig) || 
      (serverType === "plex" && !!plexConfig)
    ),
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}
