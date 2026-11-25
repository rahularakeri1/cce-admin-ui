import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ApiError } from "../api/client";
import type { User } from "../api/users";
import { InlineForbidden } from "../components/InlineForbidden";
import { useResetUserPassword } from "../hooks/useUser";
import { useRoles } from "../hooks/useRoles";
import { useUsers } from "../hooks/useUsers";

const PAGE_SIZE = 20;

interface Filters {
  q: string;
  status: string;
  roleId: string;
  facilityScope: string;
}
const EMPTY: Filters = { q: "", status: "", roleId: "", facilityScope: "" };

// ACTIVE but never logged in: the account exists but the person hasn't finished onboarding (e.g. the
// invitation email wasn't sent or hasn't been used). A reset/resend lives in Milestone 6.
const needsAttention = (u: User) => u.status === "ACTIVE" && u.lastLoginAt === null;

const statusStyle: Record<User["status"], string> = {
  ACTIVE: "bg-green-50 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-700",
};

/** One-click resend for a never-logged-in user — the same endpoint as "Password & invitation" on the detail page. */
function ResendInvite({ user }: { user: User }) {
  const reset = useResetUserPassword(user.id);
  const failed = reset.error instanceof ApiError ? reset.error : null;
  return (
    <span className="ml-2 inline-flex items-center gap-2 align-middle">
      {!reset.isSuccess && (
        <button
          type="button"
          disabled={reset.isPending}
          onClick={() => reset.mutate()}
          className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
        >
          {reset.isPending ? "Sending…" : "Resend invite"}
        </button>
      )}
      {reset.isSuccess && <span role="status" className="text-xs text-green-700">Invitation sent</span>}
      {failed && <span role="alert" className="text-xs text-red-700">{failed.message}</span>}
    </span>
  );
}

export default function UsersListPage() {
  const roles = useRoles();
  const [draft, setDraft] = useState<Filters>(EMPTY); // what's typed
  const [applied, setApplied] = useState<Filters>(EMPTY); // what the list is using
  const [page, setPage] = useState(0);
  const { data, isLoading, isFetching, error } = useUsers({ ...applied, page, pageSize: PAGE_SIZE });

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setApplied(draft);
    setPage(0);
  }
  function reset() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(0);
  }

  const total = data?.pagination.total ?? 0;
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Users</h1>
        <Link to="/users/new" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          + New User
        </Link>
      </div>

      <form onSubmit={apply} className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-white p-3">
        <div>
          <label htmlFor="f-q" className="block text-xs font-medium text-gray-600">
            Search
          </label>
          <input
            id="f-q"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            placeholder="name, username or email"
            className="mt-1 w-56 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="f-status" className="block text-xs font-medium text-gray-600">
            Status
          </label>
          <select
            id="f-status"
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">Any</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-role" className="block text-xs font-medium text-gray-600">
            Role
          </label>
          <select
            id="f-role"
            value={draft.roleId}
            onChange={(e) => setDraft({ ...draft, roleId: e.target.value })}
            className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">Any</option>
            {roles.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-facility" className="block text-xs font-medium text-gray-600">
            Facility
          </label>
          <input
            id="f-facility"
            value={draft.facilityScope}
            onChange={(e) => setDraft({ ...draft, facilityScope: e.target.value })}
            className="mt-1 w-36 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <button type="submit" className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900">
          Apply
        </button>
        <button type="button" onClick={reset} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Reset
        </button>
      </form>

      {isLoading && <p className="text-sm text-gray-500">Loading users…</p>}
      {error instanceof ApiError && error.status === 403 && <InlineForbidden message="You can't view users." />}
      {error && !(error instanceof ApiError && error.status === 403) && (
        <p role="alert" className="text-sm text-red-700">
          Could not load users — try reloading.
        </p>
      )}

      {data && (
        <>
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Roles</th>
                  <th className="px-4 py-2 font-medium">Facility</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Last login</th>
                </tr>
              </thead>
              <tbody>
                {data.users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      No users match these filters.
                    </td>
                  </tr>
                )}
                {data.users.map((u) => (
                  <tr key={u.id} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-3">
                      <Link to={`/users/${u.id}`} className="font-medium text-blue-700 hover:underline">
                        {u.firstName} {u.lastName}
                      </Link>
                      <div className="font-mono text-xs text-gray-500">{u.username}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 && <span className="text-gray-400">—</span>}
                        {u.roles.map((r) => (
                          <span key={r} className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-800">
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{u.facilityScope ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[u.status]}`}>{u.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {u.lastLoginAt ? format(new Date(u.lastLoginAt), "yyyy-MM-dd HH:mm") : "Never"}
                      {needsAttention(u) && (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800" title="Active, but has never logged in">
                          Needs attention
                        </span>
                      )}
                      {needsAttention(u) && <ResendInvite user={u} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
            <span aria-live="polite">
              {total === 0 ? "0 users" : `Showing ${first}–${last} of ${total}`}
              {isFetching && " …"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!hasPrev}
                onClick={() => setPage(page - 1)}
                className="rounded-md border border-gray-300 px-3 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={() => setPage(page + 1)}
                className="rounded-md border border-gray-300 px-3 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
