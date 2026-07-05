import { useState } from "react";
import { MediaStage } from "../MediaStage";
import { useLibraryStore } from "../../store/useLibraryStore";
import { useLibraryQuery } from "../../hooks/useLibraryQuery";
import type { MediaItem } from "../../types";

export default function SearchView({ onSelect }: { onSelect: (item: MediaItem) => void }) {
  const [query, setQuery]    = useState("");
  const { data: source = [] } = useLibraryQuery();
  const results = query.length > 1
    ? source.filter((i) =>
        i.title.toLowerCase().includes(query.toLowerCase()) ||
        i.artist?.toLowerCase().includes(query.toLowerCase()) ||
        i.genre?.some((g) => g.toLowerCase().includes(query.toLowerCase()))
      )
    : [];

  return (
    <div className="px-4 sm:px-8 lg:px-20 pt-10">
      <h1 className="font-display font-black text-on_surface mb-8" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
        Search
      </h1>
      <div
        className="relative mb-10"
        style={{ maxWidth: 640 }}
      >
        <svg
          className="absolute left-5 top-1/2 -translate-y-1/2"
          width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="#9aa3b4" strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, artists, genres…"
          className="w-full pl-14 pr-6 py-4 rounded-xl font-body text-on_surface placeholder-on_surface_variant text-lg"
          style={{
            background: "rgba(22,26,38,0.8)",
            border: "1px solid rgba(46,52,71,0.4)",
            cursor: "none",
            caretColor: "#99f7ff",
          }}
          autoFocus
        />
      </div>

      {results.length > 0 && (
        <MediaStage title={`Results for "${query}"`} items={results} onSelect={onSelect} />
      )}

      {query.length > 1 && results.length === 0 && (
        <div className="text-center py-16">
          <p className="font-display font-bold text-on_surface_variant text-xl">No results found</p>
          <p className="font-body text-on_surface_variant text-sm mt-2">Try a different search term</p>
        </div>
      )}

      {query.length === 0 && (
        <div>
          <p className="font-mono-tech text-on_surface_variant text-xs mb-6">BROWSE BY GENRE</p>
          <div className="flex flex-wrap gap-3">
            {["Action", "Drama", "Sci-Fi", "Thriller", "Electronic", "R&B", "Hip-Hop", "Post-Apocalyptic"].map((genre) => (
              <button
                key={genre}
                data-magnetic
                data-magnetic-id={`genre-${genre}`}
                onClick={() => setQuery(genre)}
                className="px-5 py-2.5 rounded-full font-body text-sm"
                style={{
                  background: "rgba(28,52,55,0.6)",
                  color: "#b2ccd0",
                  border: "1px solid rgba(46,52,71,0.3)",
                  cursor: "none",
                }}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
