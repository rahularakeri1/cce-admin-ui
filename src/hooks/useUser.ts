import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getUser, replaceUserRoles, resetUserPassword, setUserStatus, updateUser, type UpdateUserInput, type User } from "../api/users";
import { usersKey } from "./useUsers";

const userKey = (id: string) => ["user", id] as const;

export function useUser(id: string) {
  return useQuery({ queryKey: userKey(id), queryFn: () => getUser(id) });
}

// No optimistic UI (F-06). Each action is its OWN mutation so each has its own pending state and
// error surface. On success the page is NOT patched from the response: the user and the list are
// REFETCHED from the server, and the returned promise keeps the button on "Saving…" until that refresh
// lands, so what you see afterwards is what is actually stored.
function useUserAction<TVars, TResult>(id: string, fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: userKey(id) }),
        queryClient.invalidateQueries({ queryKey: usersKey }),
      ]),
  });
}

export const useUpdateUser = (id: string) => useUserAction(id, (input: UpdateUserInput) => updateUser(id, input));
export const useSetUserStatus = (id: string) => useUserAction(id, (status: User["status"]) => setUserStatus(id, status));
export const useReplaceUserRoles = (id: string) => useUserAction(id, (roleIds: string[]) => replaceUserRoles(id, roleIds));

export function useResetUserPassword(id: string) {
  return useMutation({ mutationFn: () => resetUserPassword(id) });
}
