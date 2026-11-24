import { useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ApiError } from "../api/client";
import { InlineForbidden } from "../components/InlineForbidden";
import { useMenuCatalog, useRoleMenuIds, useSaveRoleMenus } from "../hooks/useRoleMenus";
import { useRole } from "../hooks/useRoles";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 px-3 py-2 text-sm font-medium ${
    isActive ? "border-blue-600 text-blue-700" : "border-transparent text-gray-600 hover:text-gray-900"
  }`;

export default function RoleDetailPage() {
  const { id = "" } = useParams();
  const { data: role, isLoading, error } = useRole(id);

  if (isLoading) return <p className="text-sm text-gray-500">Loading role…</p>;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div>
        <p className="text-sm text-gray-700">Role not found.</p>
        <Link to="/roles" className="text-sm font-medium text-blue-700 hover:underline">
          Back to roles
        </Link>
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 403) return <InlineForbidden message="You can't view this role." />;
  if (error || !role) return <p role="alert" className="text-sm text-red-700">Could not load this role — try reloading.</p>;

  return (
    <div>
      <Link to="/roles" className="text-sm text-blue-700 hover:underline">
        ← Roles
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold text-gray-900">
        {role.isSystem && <LockClosedIcon className="h-5 w-5 text-gray-400" aria-label="System role (locked)" />}
        {role.displayName} <span className="font-mono text-base font-normal text-gray-500">({role.name})</span>
      </h1>

      <nav className="mt-4 flex gap-2 border-b border-gray-200" aria-label="Role sections">
        <NavLink to={`/roles/${role.id}`} end className={tabClass}>
          Menus
        </NavLink>
        <NavLink to={`/roles/${role.id}/permissions`} className={tabClass}>
          Permissions
        </NavLink>
      </nav>

      <div className="mt-4">
        <Outlet />
      </div>
    </div>
  );
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

export function RoleMenusTab() {
  const { id = "" } = useParams();
  const catalog = useMenuCatalog();
  const saved = useRoleMenuIds(id);
  const save = useSaveRoleMenus(id);
  // null = no local edits yet; the checkboxes then mirror what the server last returned.
  const [draft, setDraft] = useState<Set<string> | null>(null);

  if (catalog.isLoading || saved.isLoading) return <p className="text-sm text-gray-500">Loading menus…</p>;
  const failure = catalog.error ?? saved.error;
  if (failure instanceof ApiError && failure.status === 403) return <InlineForbidden message="You can't view menus." />;
  if (failure || !catalog.data || !saved.data)
    return <p role="alert" className="text-sm text-red-700">Could not load menus — try reloading.</p>;

  const serverSet = new Set(saved.data);
  const selected = draft ?? serverSet;
  const changed = draft !== null && !sameSet(draft, serverSet);
  const saveError = save.error instanceof ApiError ? save.error : null;

  function toggle(menuId: string) {
    const next = new Set(selected);
    if (next.has(menuId)) next.delete(menuId);
    else next.add(menuId);
    setDraft(next);
  }

  function onSave() {
    // Always the COMPLETE set, never a partial diff.
    save.mutate([...selected].sort(), { onSuccess: () => setDraft(null) });
  }

  return (
    <div>
      <p className="mb-3 text-sm text-gray-600">
        Menus this role can see in a console that uses the menu list. Saving replaces the whole set.
      </p>
      <ul className="space-y-2 rounded-md border border-gray-200 bg-white p-4">
        {catalog.data.map((menu) => (
          <li key={menu.id}>
            <label className="flex items-center gap-3 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={selected.has(menu.id)}
                onChange={() => toggle(menu.id)}
                disabled={save.isPending}
              />
              <span>{menu.label}</span>
              <span className="font-mono text-xs text-gray-400">{menu.path}</span>
              {!menu.isActive && <span className="text-xs text-amber-700">(inactive)</span>}
            </label>
          </li>
        ))}
      </ul>

      {saveError?.status === 403 && <div className="mt-3"><InlineForbidden message="You can't change this role's menus." /></div>}
      {saveError && saveError.status !== 403 && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {saveError.message}
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={!changed || save.isPending}
        className="mt-4 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
