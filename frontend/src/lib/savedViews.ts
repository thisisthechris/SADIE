import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type SavedView = {
  id: number;
  name: string;
  path: string;
  query_string: string;
  is_public: boolean;
  slug: string;
  owner_username: string;
  is_owner: boolean;
  short_url: string;
  created_at: string;
  updated_at: string;
};

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export function useMySavedViews() {
  return useQuery({
    queryKey: ["saved-views", "mine"],
    queryFn: () => api<{ results: SavedView[] }>("/api/views/mine/"),
    staleTime: 30_000,
  });
}

export function useSavedView(slug: string | undefined) {
  return useQuery({
    queryKey: ["saved-view", slug],
    queryFn: () => api<SavedView>(`/api/views/${slug}/`),
    enabled: !!slug,
  });
}

export function useAllSavedViews() {
  return useQuery({
    queryKey: ["saved-views", "all"],
    queryFn: () => api<Paginated<SavedView>>("/api/views/"),
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; path: string; query_string: string; is_public: boolean }) =>
      api<SavedView>("/api/views/", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-views"] });
    },
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api<void>(`/api/views/${slug}/`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-views"] });
    },
  });
}
