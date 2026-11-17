import { NavLink, Route, Routes } from "react-router-dom";
import { useMe } from "./hooks/useMe";
import { logout } from "./auth/keycloak";

// Static sidebar (Users, Roles, Menus) — does NOT consume GET /me/menus. This console's own nav
// is intentionally static regardless of role; only cce-insights-ui would ever be role-aware here
// (and that integration is out of scope). See docs/architecture-overview.md §3.
const NAV_ITEMS = [
  { to: "/users", label: "Users" },
  { to: "/roles", label: "Roles" },
  { to: "/menus", label: "Menus" },
];

function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">Screen not built yet — Milestone 3+.</p>
    </div>
  );
}

export default function App() {
  const { data: me, isLoading } = useMe();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <nav className="w-56 flex-none border-r border-gray-200 bg-white p-4">
        <div className="mb-6 text-lg font-bold text-gray-900">CCE Admin</div>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
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
                <span className="text-gray-400">({me.roles.join(", ")})</span>
              </>
            ) : (
              "Not signed in"
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

        <main className="flex-1 p-6">
          <Routes>
            <Route path="/users" element={<Placeholder title="Users" />} />
            <Route path="/roles" element={<Placeholder title="Roles" />} />
            <Route path="/menus" element={<Placeholder title="Menus" />} />
            <Route path="*" element={<Placeholder title="Users" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
