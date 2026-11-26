import { useQuery } from "@tanstack/react-query";
import { getMyMenus } from "../api/me";

/**
 * The tabs this console shows the signed-in user — from GET /me/menus?console=ADMIN, never a static list.
 * Re-checked whenever the browser tab regains focus, so a change another admin just made (a tab added or
 * taken away) shows without a manual reload; the service reads the database roles on every call.
 */
export function useAdminMenus() {
  return useQuery({
    queryKey: ["me", "menus", "ADMIN"],
    queryFn: () => getMyMenus("ADMIN"),
    refetchOnWindowFocus: true,
  });
}
