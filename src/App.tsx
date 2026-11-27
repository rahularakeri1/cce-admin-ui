import type { ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useMe } from "./hooks/useMe";
import { useAdminMenus } from "./hooks/useAdminMenus";
import { logout } from "./auth/keycloak";
import { ApiError } from "./api/client";
import type { MyMenu } from "./api/me";
import RolesListPage from "./pages/RolesListPage";
import UserCreatePage from "./pages/UserCreatePage";
import UserDetailPage from "./pages/UserDetailPage";
import UsersListPage from "./pages/UsersListPage";
import RoleDetailPage, { RoleMenusTab } from "./pages/RoleDetailPage";
import RolePermissionsTab from "./pages/RolePermissionsTab";
import ProtocolsListPage from "./pages/ProtocolsListPage";
import ProtocolDetailPage from "./pages/ProtocolDetailPage";
import ProtocolUploadPage from "./pages/ProtocolUploadPage";
import MenusCatalogPage from "./pages/MenusCatalogPage";
import MenuFormPage from "./pages/MenuFormPage";

// The screens this build knows how to draw. The sidebar is NOT this list: it comes from
// GET /me/menus?console=ADMIN (the user's own roles), and a tab the API returns that isn't drawn here
// is simply not shown. See docs/architecture-overview.md §3 (this reverses the old static sidebar, F-03).
const KNOWN_SCREENS = ["/users", "/roles", "/menus", "/protocols"];

function NoAccess() {
  return (
    <div role="status" className="mx-auto mt-16 max-w-md rounded-md border border-gray-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold text-gray-900">No access to the admin console</h1>
      <p className="mt-2 text-sm text-gray-600">
        Your account is not allowed to open any admin tab. Ask a Super Admin to give your role one.
      </p>
      <button
        type="button"
        onClick={logout}
        className="mt-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Sign out
      </button>
    </div>
  );
}

function MenusError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-md border border-red-200 bg-red-50 p-6 text-center">
      <h1 className="text-lg font-semibold text-red-800">Could not load your menus</h1>
      <p className="mt-2 text-sm text-red-700">We can't tell which tabs you may open, so none are shown.</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

function AdminRoutes({ menus }: { menus: MyMenu[] }) {
  const has = (path: string) => menus.some((m) => m.path === path);
  return (
    <Routes>
      {has("/users") && (
        <>
          <Route path="/users" element={<UsersListPage />} />
          <Route path="/users/new" element={<UserCreatePage />} />
          <Route path="/users/:id" element={<UserDetailPage />} />
        </>
      )}
      {has("/roles") && (
        <>
          <Route path="/roles" element={<RolesListPage />} />
          <Route path="/roles/:id" element={<RoleDetailPage />}>
            <Route index element={<RoleMenusTab />} />
            <Route path="permissions" element={<RolePermissionsTab />} />
          </Route>
        </>
      )}
      {has("/menus") && (
        <>
          <Route path="/menus" element={<MenusCatalogPage />} />
          <Route path="/menus/new" element={<MenuFormPage />} />
          <Route path="/menus/:id" element={<MenuFormPage />} />
        </>
      )}
      {has("/protocols") && (
        <>
          <Route path="/protocols" element={<ProtocolsListPage />} />
          <Route path="/protocols/new" element={<ProtocolUploadPage />} />
          <Route path="/protocols/:id" element={<ProtocolDetailPage />} />
        </>
      )}
      {/* Anything the user may not open (and "/") lands on their first allowed tab, never on a forbidden one. */}
      <Route path="*" element={<Navigate to={menus[0].path} replace />} />
    </Routes>
  );
}

export default function App() {
  const { data: me, isLoading, error, refetch: refetchMe } = useMe();
  const menusQuery = useAdminMenus();

  // Only tabs this build can draw; the API's order (sort_order) is kept, so the first one is the landing page.
  const tabs = menusQuery.data?.filter((m) => KNOWN_SCREENS.includes(m.path));

  let body: ReactNode;
  if (tabs) {
    body = tabs.length > 0 ? <AdminRoutes menus={tabs} /> : <NoAccess />;
  } else if (menusQuery.isLoading) {
    body = <p className="text-sm text-gray-500">Loading…</p>;
  } else if (menusQuery.error instanceof ApiError && menusQuery.error.status === 403) {
    // 403 = this account has no local admin user / no role — an answer, not a failure: nothing to retry.
    body = <NoAccess />;
  } else {
    // Retry reloads the profile too: both calls fail together when the service is down, and the header's
    // "Could not load your profile" would otherwise outlive the outage.
    body = (
      <MenusError
        onRetry={() => {
          void menusQuery.refetch();
          void refetchMe();
        }}
        retrying={menusQuery.isFetching}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <nav className="w-56 flex-none border-r border-gray-200 bg-white p-4" aria-label="Admin tabs">
        <div className="mb-6 text-lg font-bold text-gray-900">CCE Admin</div>
        <ul className="space-y-1">
          {(tabs ?? []).map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm font-medium ${
                    isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div className="text-sm text-gray-600">
            {isLoading ? (
              "Loading…"
            ) : me ? (
              <>
                Signed in as <span className="font-medium text-gray-900">{me.username}</span>{" "}
                <span className="text-gray-400">
                  ({me.roles.length > 0 ? me.roles.join(", ") : "no roles"})
                </span>
              </>
            ) : error instanceof ApiError && error.status === 403 ? (
              <span className="text-red-700">
                Your account has no access to the admin console — ask a Super Admin to add you.
              </span>
            ) : (
              <span className="text-red-700">Could not load your profile — try reloading.</span>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </header>

        <main className="flex-1 p-6">{body}</main>
      </div>
    </div>
  );
}
