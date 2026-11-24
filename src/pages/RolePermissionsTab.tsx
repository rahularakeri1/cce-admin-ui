import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ApiError } from "../api/client";
import { HTTP_METHODS, type HttpMethod, type Permission } from "../api/roles";
import { InlineForbidden } from "../components/InlineForbidden";
import { SyncFailedNotice } from "../components/SyncFailedNotice";
import {
  useRefreshRolePermissions,
  useResyncRole,
  useRolePermissions,
  useSaveRolePermissions,
} from "../hooks/useRolePermissions";
import { useRole } from "../hooks/useRoles";
import { validatePermissionRows } from "../schemas/permission";

interface Row {
  key: number;
  httpMethod: HttpMethod;
  uriPattern: string;
  description: string;
  category: string;
}

// Last known gateway-sync outcome in THIS browser session. Nothing is stored server-side and
// gateway can't tell us whether a role exists in Keycloak, so a fresh load is honestly "unknown".
type SyncState = "unknown" | "synced" | "failed";

const toRows = (perms: Permission[], nextKey: () => number): Row[] =>
  perms.map((p) => ({
    key: nextKey(),
    httpMethod: p.httpMethod,
    uriPattern: p.uriPattern,
    description: p.description ?? "",
    category: p.category ?? "",
  }));

const signature = (rows: { httpMethod: string; uriPattern: string; description?: string | null; category?: string | null }[]) =>
  rows
    .map((r) => [r.httpMethod, r.uriPattern.trim(), (r.description ?? "").trim(), (r.category ?? "").trim()].join("|"))
    .sort()
    .join("\n");

export default function RolePermissionsTab() {
  const { id = "" } = useParams();
  const role = useRole(id);
  const saved = useRolePermissions(id);
  const save = useSaveRolePermissions(id);
  const resync = useResyncRole(id);
  const cache = useRefreshRolePermissions(id);

  const keyCounter = useRef(0);
  const nextKey = () => ++keyCounter.current;
  const [draft, setDraft] = useState<Row[] | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("unknown");
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [serverError, setServerError] = useState<ApiError | null>(null);

  if (role.isLoading || saved.isLoading) return <p className="text-sm text-gray-500">Loading permissions…</p>;
  const failure = role.error ?? saved.error;
  if (failure instanceof ApiError && failure.status === 403) return <InlineForbidden message="You can't view permissions." />;
  if (failure || !role.data || !saved.data)
    return <p role="alert" className="text-sm text-red-700">Could not load permissions — try reloading.</p>;

  const isSystem = role.data.isSystem;
  const serverRows = saved.data;
  const rows = draft ?? toRows(serverRows, nextKey);
  const changed = draft !== null && signature(draft) !== signature(serverRows);

  function edit(next: Row[]) {
    setDraft(next);
    setRowErrors({});
    setServerError(null);
  }
  const update = (key: number, patch: Partial<Row>) => edit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => edit(rows.filter((r) => r.key !== key));
  const add = () =>
    edit([...rows, { key: nextKey(), httpMethod: "GET", uriPattern: "", description: "", category: "" }]);

  function onSave() {
    const errors = validatePermissionRows(rows);
    if (Object.keys(errors).length > 0) {
      setRowErrors(errors);
      return;
    }
    setServerError(null);
    // Always the COMPLETE set, never a diff.
    const payload: Permission[] = rows.map((r) => ({
      httpMethod: r.httpMethod,
      uriPattern: r.uriPattern.trim(),
      description: r.description.trim() || null,
      category: r.category.trim() || null,
    }));
    save.mutate(payload, {
      onSuccess: (result) => {
        cache.set(result.permissions);
        setDraft(null);
        setSyncState("synced");
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === "KEYCLOAK_SYNC_FAILED") {
          // The rows ARE saved — only Keycloak is behind. Reload them from the server, show the retry.
          cache.refetch().then(() => setDraft(null));
          setSyncState("failed");
        } else if (err instanceof ApiError) {
          setServerError(err);
        }
      },
    });
  }

  function onResync() {
    setServerError(null);
    resync.mutate(undefined, {
      onSuccess: () => setSyncState("synced"),
      onError: () => setSyncState("failed"),
    });
  }

  return (
    <div>
      {isSystem && (
        <p className="mb-3 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <LockClosedIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
          System role — its permissions are managed by the platform and can't be edited here.
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">URI pattern</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Description</th>
              {!isSystem && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-gray-500">
                  No permissions yet.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.key} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2">
                  {isSystem ? (
                    row.httpMethod
                  ) : (
                    <select
                      aria-label={`Method, row ${i + 1}`}
                      value={row.httpMethod}
                      onChange={(e) => update(row.key, { httpMethod: e.target.value as HttpMethod })}
                      className="rounded-md border border-gray-300 px-2 py-1"
                    >
                      {HTTP_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2 font-mono">
                  {isSystem ? (
                    row.uriPattern
                  ) : (
                    <>
                      <input
                        aria-label={`URI pattern, row ${i + 1}`}
                        aria-invalid={rowErrors[i] ? "true" : "false"}
                        value={row.uriPattern}
                        onChange={(e) => update(row.key, { uriPattern: e.target.value })}
                        placeholder="/v1/insights/**"
                        className="w-full rounded-md border border-gray-300 px-2 py-1"
                      />
                      {rowErrors[i] && (
                        <p role="alert" className="mt-1 font-sans text-xs text-red-700">
                          {rowErrors[i]}
                        </p>
                      )}
                    </>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isSystem ? (
                    row.category
                  ) : (
                    <input
                      aria-label={`Category, row ${i + 1}`}
                      value={row.category}
                      onChange={(e) => update(row.key, { category: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-2 py-1"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isSystem ? (
                    row.description
                  ) : (
                    <input
                      aria-label={`Description, row ${i + 1}`}
                      value={row.description}
                      onChange={(e) => update(row.key, { description: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-2 py-1"
                    />
                  )}
                </td>
                {!isSystem && (
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => remove(row.key)}
                      aria-label={`Remove row ${i + 1}`}
                      className="text-red-700 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {serverError?.status === 403 && (
        <div className="mt-3">
          <InlineForbidden message="You can't change this role's permissions." />
        </div>
      )}
      {serverError && serverError.status !== 403 && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {serverError.message}
        </p>
      )}

      {!isSystem && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={add}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            + Add permission row
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!changed || save.isPending}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      <div className="mt-5" aria-live="polite">
        {syncState === "synced" && (
          <p className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-800">
            ✓ Synced with Keycloak
          </p>
        )}
        {syncState === "failed" && <SyncFailedNotice onRetry={onResync} retrying={resync.isPending} />}
        {syncState === "unknown" && !isSystem && (
          <p className="text-sm text-gray-600">
            Sync status unknown — Save or Re-sync to confirm Keycloak is up to date.{" "}
            <button
              type="button"
              onClick={onResync}
              disabled={resync.isPending}
              className="font-medium text-blue-700 hover:underline disabled:opacity-50"
            >
              {resync.isPending ? "Re-syncing…" : "Re-sync"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
