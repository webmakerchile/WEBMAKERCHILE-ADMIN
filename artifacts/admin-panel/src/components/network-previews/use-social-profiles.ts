import { useQuery } from "@tanstack/react-query";
import type { SocialProfilesMap } from "./types";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const FALLBACK: SocialProfilesMap = {
  instagram: { connected: false },
  tiktok: { connected: false },
  youtube: { connected: false },
  linkedin: { connected: false },
  x: { connected: false },
  facebook: { connected: false },
};

export function useSocialProfiles() {
  return useQuery<SocialProfilesMap>({
    queryKey: ["social-profiles"],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE}/social/profiles`, { credentials: "include" });
        if (!res.ok) return FALLBACK;
        return (await res.json()) as SocialProfilesMap;
      } catch {
        return FALLBACK;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
