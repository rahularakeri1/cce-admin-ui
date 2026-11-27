import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProtocol, listProtocols, retireProtocol, uploadProtocol } from "../api/protocols";

export const protocolsKey = ["protocols"] as const;
export const PROTOCOL_PAGE_SIZE = 20;

export function useProtocols(page: number) {
  return useQuery({
    queryKey: [...protocolsKey, "list", page, PROTOCOL_PAGE_SIZE],
    queryFn: () => listProtocols(page, PROTOCOL_PAGE_SIZE),
    placeholderData: keepPreviousData, // no flash of an empty table between pages
    retry: false, // a failure here is an answer to show (403, service down), not a blip to retry silently
  });
}

export function useProtocol(id: string) {
  return useQuery({
    queryKey: [...protocolsKey, "one", id],
    queryFn: () => getProtocol(id),
    retry: false,
  });
}

// No optimistic UI (F-06): wait for the server, then refetch everything under "protocols".
export function useUploadProtocol() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadProtocol,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: protocolsKey }),
  });
}

export function useRetireProtocol(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => retireProtocol(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: protocolsKey }),
    // 409 "already retired" means someone else got there first: refetch so the page shows the truth.
    onError: () => queryClient.invalidateQueries({ queryKey: protocolsKey }),
  });
}
