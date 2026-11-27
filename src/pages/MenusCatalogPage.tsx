import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ApiError } from "../api/client";
import type { Menu, ConsoleName } from "../api/menus";
import { InlineForbidden } from "../components/InlineForbidden";
import { useDeleteMenu, useMenuCatalog, useUpdateMenu } from "../hooks/useMenus";

const GROUPS: { console: ConsoleName; title: string }[] = [
  { console: "INSIGHTS", title: "Insights" },
  { console: "ADMIN", title: "Admin console" },
];

/** The admin console builds its own sidebar from these, so the server refuses to delete or hide them. */
export const isProtected = (menu: Menu) => menu.console === "ADMIN";

const PROTECTED_HINT = "Protected: this console's own sidebar is built from it";

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Your role isn't allowed to change menus.";
    if (error.status === 404) return "This menu no longer exists — the list has been refreshed.";
    return error.message;
  }
  return "Something went wrong — try again.";
}

function DeleteDialog({ menu, onClose, onDeleted }: { menu: Menu; onClose: () => void; onDeleted: () => void }) {
  const del = useDeleteMenu();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e) => e.key === "Escape" && !del.isPending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-menu-title"
        className="w-full max-w-md rounded-md border border-gray-200 bg-white p-5 shadow-lg"
      >
        <h2 id="delete-menu-title" className="text-base font-semibold text-gray-900">
          Delete “{menu.label}”?
        </h2>
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <strong>This also removes it from every role that has it.</strong> Those roles lose it silently, and it can't be
          undone.
        </p>
        <p className="mt-3 text-sm text-gray-700">
          If you only want it hidden for now, use <strong>Deactivate</strong> instead — the role assignments are kept.
        </p>
        {del.error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {errorText(del.error)}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => del.mutate(menu.id, { onSuccess: onDeleted })}
            disabled={del.isPending}
            className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {del.isPending ? "Deleting…" : "Delete menu"}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={del.isPending}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MenusCatalogPage() {
  const catalog = useMenuCatalog();
  const update = useUpdateMenu();
  const flash = (useLocation().state as { saved?: string; highlight?: string } | null) ?? null;
  const [notice, setNotice] = useState<string | null>(flash?.saved ?? null);
  const [deleting, setDeleting] = useState<Menu | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (catalog.isLoading) return <p className="text-sm text-gray-500">Loading menus…</p>;
  if (catalog.error instanceof ApiError && catalog.error.status === 403) {
    return <InlineForbidden message="You can't view the menu catalog." />;
  }
  if (catalog.error || !catalog.data) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Could not load the menu catalog — try reloading.
      </p>
    );
  }

  function toggleActive(menu: Menu) {
    setRowError(null);
    setNotice(null);
    setPendingId(menu.id);
    update.mutate(
      {
        id: menu.id,
        input: {
          menuKey: menu.menuKey,
          label: menu.label,
          path: menu.path,
          icon: menu.icon ?? undefined,
          sortOrder: menu.sortOrder,
          isActive: !menu.isActive,
        },
      },
      {
        onSuccess: () =>
          setNotice(
            menu.isActive
              ? `Deactivated “${menu.label}”. It is hidden from every sidebar; its role assignments are kept.`
              : `Activated “${menu.label}”.`,
          ),
        onError: (err) => setRowError({ id: menu.id, message: errorText(err) }),
        onSettled: () => setPendingId(null),
      },
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Menus</h1>
        <Link
          to="/menus/new"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add menu
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        The list of sidebar entries. Which roles get which entry is set on each role's Menus tab.
      </p>

      {notice && (
        <p role="status" className="mt-3 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          {notice}
        </p>
      )}

      <table className="mt-4 w-full border-collapse overflow-hidden rounded-md border border-gray-200 bg-white text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Label</th>
            <th className="px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 font-medium">Path</th>
            <th className="px-3 py-2 font-medium">Sort</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        {GROUPS.map((group) => {
          const items = catalog.data.filter((m) => m.console === group.console);
          if (items.length === 0) return null;
          return (
            <tbody key={group.console} aria-label={group.title} className="divide-y divide-gray-100">
              <tr className="bg-gray-50">
                <th colSpan={6} scope="colgroup" className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {group.title}
                </th>
              </tr>
              {items.map((menu) => {
                const locked = isProtected(menu);
                const busy = pendingId === menu.id;
                return (
                  <tr key={menu.id} className={flash?.highlight === menu.menuKey ? "bg-blue-50" : undefined}>
                    <td className={`px-3 py-2 ${menu.isActive ? "text-gray-900" : "text-gray-400 line-through"}`}>
                      {menu.label}
                      {locked && (
                        <LockClosedIcon className="ml-1 inline h-3.5 w-3.5 text-gray-400" aria-label={PROTECTED_HINT} />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{menu.menuKey}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{menu.path}</td>
                    <td className="px-3 py-2 text-gray-600">{menu.sortOrder}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          menu.isActive ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {menu.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Link
                        to={`/menus/${menu.id}`}
                        aria-label={`Edit ${menu.label}`}
                        className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </Link>{" "}
                      <button
                        type="button"
                        onClick={() => toggleActive(menu)}
                        disabled={locked || busy}
                        title={locked ? PROTECTED_HINT : undefined}
                        aria-label={`${menu.isActive ? "Deactivate" : "Activate"} ${menu.label}`}
                        className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                      >
                        {busy ? "…" : menu.isActive ? "Deactivate" : "Activate"}
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setNotice(null);
                          setDeleting(menu);
                        }}
                        disabled={locked}
                        title={locked ? PROTECTED_HINT : undefined}
                        aria-label={`Delete ${menu.label}`}
                        className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                      >
                        Delete
                      </button>
                      {rowError?.id === menu.id && (
                        <p role="alert" className="mt-1 text-left text-xs text-red-700">
                          {rowError.message}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>

      {deleting && (
        <DeleteDialog
          menu={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setNotice(`Deleted “${deleting.label}”, and removed it from every role that had it.`);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
