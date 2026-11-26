import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { useProtocol, useRetireProtocol } from "../hooks/useProtocols";
import { classifyProtocolError } from "../lib/protocolErrors";
import { StatusBadge } from "./ProtocolsListPage";

export default function ProtocolDetailPage() {
  const { id = "" } = useParams();
  const { data: protocol, isLoading, error, refetch, isFetching } = useProtocol(id);
  const retire = useRetireProtocol(id);
  const [confirming, setConfirming] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  const back = (
    <Link to="/protocols" className="text-sm text-blue-700 hover:underline">
      ← Protocols
    </Link>
  );

  if (isLoading) return <p className="text-sm text-gray-500">Loading protocol…</p>;
  if (error || !protocol) {
    const failure = classifyProtocolError(error, "load");
    return (
      <div>
        {back}
        <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">
            {failure.kind === "forbidden" ? "Your role isn't allowed to view this protocol." : failure.message}
          </p>
          {(failure.kind === "unavailable" || failure.kind === "unknown") && (
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
      </div>
    );
  }

  const formatted = JSON.stringify(protocol.definition, null, 2);
  const retireFailure = retire.error ? classifyProtocolError(retire.error, "retire") : null;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
    setTimeout(() => setCopy("idle"), 2500);
  }

  return (
    <div>
      {back}
      <h1 className="mt-2 break-all font-mono text-lg font-semibold text-gray-900">{protocol.url}</h1>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-gray-500">Version</dt>
        <dd>{protocol.version}</dd>
        <dt className="text-gray-500">Status</dt>
        <dd>
          <StatusBadge status={protocol.status} />
        </dd>
        <dt className="text-gray-500">Loaded at</dt>
        <dd>{format(new Date(protocol.loadedAt), "yyyy-MM-dd HH:mm")}</dd>
        <dt className="text-gray-500">Canonical</dt>
        <dd className="break-all font-mono text-xs text-gray-700">{protocol.canonical}</dd>
      </dl>

      {protocol.status === "ACTIVE" && !confirming && (
        <button
          type="button"
          onClick={() => {
            retire.reset();
            setConfirming(true);
          }}
          className="mt-4 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Retire
        </button>
      )}

      {protocol.status === "ACTIVE" && confirming && (
        <div role="group" aria-label="Confirm retire" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-medium">
            Retire {protocol.url} {protocol.version}?
          </p>
          <p className="mt-1 text-red-800">
            It stops matching new events straight away. Patients already enrolled are not affected. This can't be undone
            from this console.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => retire.mutate(undefined, { onSuccess: () => setConfirming(false) })}
              disabled={retire.isPending}
              className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {retire.isPending ? "Retiring…" : "Retire protocol"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={retire.isPending}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {retireFailure && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {retireFailure.message}
        </p>
      )}
      {protocol.status === "RETIRED" && (
        <p className="mt-4 text-sm text-gray-600">This protocol is retired: it no longer matches new events.</p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Stored definition (read-only)</h2>
        <span className="flex items-center gap-2">
          {copy === "copied" && <span role="status" className="text-xs text-green-700">Copied</span>}
          {copy === "failed" && <span role="status" className="text-xs text-red-700">Could not copy — select the text instead</span>}
          <button
            type="button"
            onClick={() => void onCopy()}
            className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Copy
          </button>
        </span>
      </div>
      <pre
        aria-label="Protocol definition JSON"
        className="mt-2 max-h-[32rem] overflow-auto rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-800"
      >
        {formatted}
      </pre>
    </div>
  );
}
