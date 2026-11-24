import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRolePermissions, replaceRolePermissions, resyncRole, type Permission } from "../api/roles";

const key = (roleId: string) => ["roles", roleId, "permissions"] as const;

export function useRolePermissions(roleId: string) {
  return useQuery({ queryKey: key(roleId), queryFn: () => getRolePermissions(roleId) });
}

// Both mutations leave the cache to the component: on a 502 the rows are saved but the response
// carries none, so the caller refetches; on success the server's own response is used.
export function useSaveRolePermissions(roleId: string) {
  return useMutation({ mutationFn: (rows: Permission[]) => replaceRolePermissions(roleId, rows) });
}

export function useResyncRole(roleId: string) {
  return useMutation({ mutationFn: () => resyncRole(roleId) });
}

export function useRefreshRolePermissions(roleId: string) {
  const queryClient = useQueryClient();
  return {
    set: (rows: Permission[]) => queryClient.setQueryData(key(roleId), rows),
    refetch: () => queryClient.invalidateQueries({ queryKey: key(roleId) }),
  };
}
