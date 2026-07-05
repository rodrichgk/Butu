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
