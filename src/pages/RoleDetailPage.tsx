import { useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ApiError } from "../api/client";
import { InlineForbidden } from "../components/InlineForbidden";
import { SUPER_ADMIN_ONLY_MENU_KEYS, type Menu } from "../api/menus";
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

type MenuState = "editable" | "locked" | "superAdminOnly";

/**
 * What the server would do with this checkbox (PUT /roles/:id/menus): SUPER_ADMIN must keep every menu
 * (locked, ticked); the Users, Roles and Menus tabs belong to SUPER_ADMIN alone (greyed out on any
 * other role); everything else — insights menus and the Protocols tab — is open to every role.
 */
function menuState(menu: Menu, roleName: string): MenuState {
  // SUPER_ADMIN sees everything: every entry, admin tab or insights menu, is locked on (Milestone 9 follow-up).
  if (roleName === "SUPER_ADMIN") return "locked";
  if (menu.console !== "ADMIN") return "editable";
  return SUPER_ADMIN_ONLY_MENU_KEYS.has(menu.menuKey) ? "superAdminOnly" : "editable";
}

const GROUPS: { console: Menu["console"]; title: string }[] = [
  { console: "INSIGHTS", title: "Insights" },
  { console: "ADMIN", title: "Admin console" },
];

export function RoleMenusTab() {
  const { id = "" } = useParams();
  const { data: role } = useRole(id);
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
  const roleName = role?.name ?? "";
  const isSuperAdmin = roleName === "SUPER_ADMIN";
  // A locked tab is always sent ticked, whatever the last response said.
  const locked = catalog.data.filter((m) => menuState(m, roleName) === "locked").map((m) => m.id);
  const effective = new Set([...selected, ...locked]);

  function toggle(menuId: string) {
    const next = new Set(effective);
    if (next.has(menuId)) next.delete(menuId);
    else next.add(menuId);
    setDraft(next);
  }

  function onSave() {
    // Always the COMPLETE set, never a partial diff.
    save.mutate([...effective].sort(), { onSuccess: () => setDraft(null) });
  }

  return (
    <div>
      <p className="mb-3 text-sm text-gray-600">
        The tabs this role shows in each console. Saving replaces the whole set. Users, Roles and Menus are
        Super Admin only, so they can't be given to another role.
      </p>
      {isSuperAdmin && (
        <p className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Super Admin sees every menu, so nothing here can be turned off.
        </p>
      )}
      <div className="space-y-4">
        {GROUPS.map((group) => {
          const items = catalog.data.filter((m) => m.console === group.console);
          if (items.length === 0) return null;
          return (
            <section key={group.console} aria-labelledby={`menus-${group.console}`} className="rounded-md border border-gray-200 bg-white p-4">
              <h2 id={`menus-${group.console}`} className="mb-2 text-sm font-semibold text-gray-900">
                {group.title}
              </h2>
              <ul className="space-y-2">
                {items.map((menu) => {
                  const state = menuState(menu, roleName);
                  const disabled = save.isPending || state !== "editable";
                  return (
                    <li key={menu.id}>
                      <label
                        className={`flex items-center gap-3 text-sm ${state === "superAdminOnly" ? "text-gray-400" : "text-gray-800"}`}
                      >
                        <input
                          type="checkbox"
                          checked={effective.has(menu.id)}
                          onChange={() => toggle(menu.id)}
                          disabled={disabled}
                        />
                        <span>{menu.label}</span>
                        <span className="font-mono text-xs text-gray-400">{menu.path}</span>
                        {!menu.isActive && <span className="text-xs text-amber-700">(inactive)</span>}
                        {state === "locked" && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <LockClosedIcon className="h-4 w-4" aria-hidden="true" />
                            Always on for Super Admin
                          </span>
                        )}
                        {state === "superAdminOnly" && <span className="text-xs">Super Admin only</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {saveError?.status === 403 && <div className="mt-3"><InlineForbidden message="You can't change this role's menus." /></div>}
      {saveError && saveError.status !== 403 && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {saveError.message}
        </p>
      )}

      {!isSuperAdmin && (
        <button
          type="button"
          onClick={onSave}
          disabled={!changed || save.isPending}
          className="mt-4 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}
