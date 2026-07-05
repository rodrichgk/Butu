import { useMutation } from "@tanstack/react-query";
import { authenticateUser } from "../services/jellyfinApi";

export function useJellyfinSignIn() {
  return useMutation({
    mutationFn: ({ url, username, password }: any) => authenticateUser(url, username, password)
  });
}
