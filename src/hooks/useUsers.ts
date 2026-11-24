import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, listUsers, type UserListParams } from "../api/users";

export const usersKey = ["users"] as const;

export function useUsers(params: UserListParams) {
  return useQuery({
    queryKey: [...usersKey, params],
    queryFn: () => listUsers(params),
    placeholderData: keepPreviousData, // no flash of an empty table between pages
  });
}

// No optimistic UI (F-06): wait for the server, then refetch the list.
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  });
}
