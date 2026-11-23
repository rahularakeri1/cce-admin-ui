import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRole, deleteRole, getRole, listRoles } from "../api/roles";

export const rolesKey = ["roles"] as const;

export function useRoles() {
  return useQuery({ queryKey: rolesKey, queryFn: listRoles });
}

export function useRole(id: string) {
  return useQuery({ queryKey: [...rolesKey, id], queryFn: () => getRole(id) });
}

// No optimistic UI (F-06): both mutations wait for the server, then refetch the list.
export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesKey }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesKey }),
  });
}
