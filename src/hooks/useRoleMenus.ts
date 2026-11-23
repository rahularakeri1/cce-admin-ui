import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMenus } from "../api/menus";
import { getRoleMenuIds, replaceRoleMenus } from "../api/roles";

export function useMenuCatalog() {
  return useQuery({ queryKey: ["menus"], queryFn: listMenus });
}

export function useRoleMenuIds(roleId: string) {
  return useQuery({ queryKey: ["roles", roleId, "menus"], queryFn: () => getRoleMenuIds(roleId) });
}

export function useSaveRoleMenus(roleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (menuIds: string[]) => replaceRoleMenus(roleId, menuIds),
    // The server's own response becomes the new "last fetched" state — not a client guess.
    onSuccess: (menuIds) => queryClient.setQueryData(["roles", roleId, "menus"], menuIds),
  });
}
