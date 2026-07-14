import { useMutation, useQuery } from "@tanstack/react-query";
import {
  plexSignIn,
  verifyPlexServer,
  createPlexPin,
  pollPlexPin,
  fetchPlexResources,
  pickPlexConnection,
  type PlexServer,
} from "../services/plexApi";

export function usePlexSignIn() {
  return useMutation({
    mutationFn: ({ username, password }: any) => plexSignIn(username, password)
  });
}

export function usePlexResources(token: string | null) {
  return useQuery({
    queryKey: ["plexResources", token],
    queryFn: () => {
      if (!token) return [];
      return fetchPlexResources(token);
    },
    enabled: !!token,
    retry: 1,
    // A server's connections change the moment the user toggles Remote Access / Relay,
    // so never reuse a cached list here — always re-fetch the live connection set when
    // (re)entering discovery. Otherwise "I just enabled Relay" shows the stale pre-relay
    // list and the connect keeps failing. Overrides the global 5-min staleTime.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
}

export function usePlexPinCreate() {
  return useMutation({
    mutationFn: () => createPlexPin()
  });
}

export function usePlexPinPoll(pinId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["plexPinPoll", pinId],
    queryFn: async () => {
      if (!pinId) return null;
      const tok = await pollPlexPin(pinId).catch(() => null);
      if (!tok) throw new Error("Not yet"); // throw to trigger retry
      return tok;
    },
    enabled: enabled && !!pinId,
    refetchInterval: (query) => (query.state.data ? false : 2000), // stop polling once we get a token
    retry: true,
    // The queryFn throws until the user links, so polling cadence is really the
    // RETRY delay — and the default is exponential backoff capped at 30s, which
    // made link detection take up to 30s ("waiting to link" looked stuck).
    retryDelay: 2000,
  });
}

export function usePlexConnection() {
  return useMutation({
    mutationFn: (server: PlexServer) => pickPlexConnection(server)
  });
}

export function usePlexVerify() {
  return useMutation({
    mutationFn: ({ url, token }: { url: string; token: string }) => verifyPlexServer(url, token)
  });
}
