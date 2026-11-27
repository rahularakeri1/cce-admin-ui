import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createMenu, deleteMenu, reorderMenus, updateMenu, type ConsoleName, type MenuInput } from "../api/menus";
import { useMenuCatalog } from "./useRoleMenus";

// The catalog read is shared with the role's Menus tab (same list, same cache key).
export { useMenuCatalog };

/**
 * A change to the catalog can change what other screens show, so after any mutation refetch all of them: the
 * catalog itself, every role's saved menu set (a delete removes the entry from the roles that held it), and this
 * console's own sidebar (an admin tab's label or order may have changed).
 */
function useRefreshAfterMenuChange() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["menus"] }),
      queryClient.invalidateQueries({ queryKey: ["roles"] }),
      queryClient.invalidateQueries({ queryKey: ["me", "menus"] }),
    ]);
}

// No optimistic UI (F-06): wait for the server, then refetch.
export function useCreateMenu() {
  const refresh = useRefreshAfterMenuChange();
  return useMutation({ mutationFn: (input: MenuInput) => createMenu(input), onSuccess: refresh });
}

export function useUpdateMenu() {
  const refresh = useRefreshAfterMenuChange();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MenuInput }) => updateMenu(id, input),
    onSuccess: refresh,
    onError: refresh, // a 409/404 usually means the catalog changed under us: show the truth
  });
}

export function useDeleteMenu() {
  const refresh = useRefreshAfterMenuChange();
  return useMutation({ mutationFn: (id: string) => deleteMenu(id), onSuccess: refresh, onError: refresh });
}

/** Saves one console's arrangement (the complete ordered ids). A stale list is answered with a refetch of the truth. */
export function useReorderMenus() {
  const refresh = useRefreshAfterMenuChange();
  return useMutation({
    mutationFn: ({ console, menuIds }: { console: ConsoleName; menuIds: string[] }) => reorderMenus(console, menuIds),
    onSuccess: refresh,
    onError: refresh,
  });
}
