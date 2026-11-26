import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { format } from "date-fns";
import type { ProtocolStatus } from "../api/protocols";
import { PROTOCOL_PAGE_SIZE, useProtocols } from "../hooks/useProtocols";
import { classifyProtocolError } from "../lib/protocolErrors";

export const protocolStatusStyle: Record<ProtocolStatus, string> = {
  ACTIVE: "bg-green-50 text-green-800",
  RETIRED: "bg-gray-100 text-gray-700",
};

export function StatusBadge({ status }: { status: ProtocolStatus }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${protocolStatusStyle[status]}`}>{status}</span>;
}

export default function ProtocolsListPage() {
  const [page, setPage] = useState(0);
  const { data, isLoading, isFetching, error, refetch } = useProtocols(page);
  // Set by the upload page when it navigates back here.
  const uploaded = (useLocation().state as { uploaded?: string } | null)?.uploaded;

  const failure = error ? classifyProtocolError(error, "load") : null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Protocols</h1>
        <Link
          to="/protocols/new"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Upload protocol
        </Link>
      </div>

      {uploaded && (
        <p role="status" className="mt-3 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          Uploaded {uploaded}. It is ACTIVE and matching new events.
        </p>
      )}

      {isLoading && <p className="mt-4 text-sm text-gray-500">Loading protocols…</p>}

      {failure && (
        <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">
            {failure.kind === "forbidden" ? "Your role isn't allowed to view protocols." : failure.message}
          </p>
          {failure.kind !== "forbidden" && failure.kind !== "expired" && (
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="mt-2 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              {isFetching ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      )}

      {data && !failure && (
        <>
          {data.items.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">No protocols are loaded yet. Use “Upload protocol” to add one.</p>
          ) : (
            <table className="mt-4 w-full border-collapse overflow-hidden rounded-md border border-gray-200 bg-white text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">URL</th>
                  <th className="px-3 py-2 font-medium">Version</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Loaded at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <Link to={`/protocols/${p.id}`} className="font-mono text-xs text-blue-700 hover:underline">
                        {p.url}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{p.version}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2 text-gray-600">{format(new Date(p.loadedAt), "yyyy-MM-dd HH:mm")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
            <span>
              {data.total} protocol{data.total === 1 ? "" : "s"}
              {data.totalPages > 1 && ` · page ${data.page + 1} of ${data.totalPages}`} · {PROTOCOL_PAGE_SIZE}/page
            </span>
            {data.totalPages > 1 && (
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || isFetching}
                  className="rounded border border-gray-300 px-2.5 py-1 hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page + 1 >= data.totalPages || isFetching}
                  className="rounded border border-gray-300 px-2.5 py-1 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
