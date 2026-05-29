import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { RuntimeConfig, User } from "./types";

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => api<RuntimeConfig>("/api/config/"),
    staleTime: Infinity,
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<User>("/api/auth/me/");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
}
