import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ApiError } from "../api/client";
import type { Menu, ConsoleName } from "../api/menus";
import { InlineForbidden } from "../components/InlineForbidden";
import { MenuIcon } from "../lib/menuIcons";
import { useMenuCatalog, useReorderMenus, useUpdateMenu } from "../hooks/useMenus";

const GROUPS: { console: ConsoleName; title: string }[] = [
  { console: "INSIGHTS", title: "Insights" },
  { console: "ADMIN", title: "Admin console" },
];

/** The admin console builds its own sidebar from these, so the server refuses to hide them. */
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

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

type Drafts = Partial<Record<ConsoleName, string[]>>;

/**
 * The order to show for one group: the draft, reconciled with what the server has now. An entry removed since the
 * draft was made drops out of it; one added since appears at the end — so a draft never refers to something that
 * isn't there, and always covers exactly the group's current entries (which is what the server insists on).
 */
function reconcile(draft: string[] | undefined, serverOrder: string[]): string[] {
  if (!draft) return serverOrder;
  const known = new Set(serverOrder);
  const kept = draft.filter((id) => known.has(id));
  const keptSet = new Set(kept);
  return [...kept, ...serverOrder.filter((id) => !keptSet.has(id))];
}

export default function MenusCatalogPage() {
  const catalog = useMenuCatalog();
  const update = useUpdateMenu();
  const reorder = useReorderMenus();
  const flash = (useLocation().state as { saved?: string; highlight?: string } | null) ?? null;
  const [notice, setNotice] = useState<string | null>(flash?.saved ?? null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Arranging: nothing is stored until Save order. `drafts` is the unsaved order per group.
  const [drafts, setDrafts] = useState<Drafts>({});
  const [dragging, setDragging] = useState<{ id: string; console: ConsoleName } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

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

  const byId = new Map(catalog.data.map((m) => [m.id, m]));
  const serverOrder = (c: ConsoleName) => catalog.data.filter((m) => m.console === c).map((m) => m.id);
  const shownOrder = (c: ConsoleName) => reconcile(drafts[c], serverOrder(c));
  const changedGroups = GROUPS.map((g) => g.console).filter((c) => !sameOrder(shownOrder(c), serverOrder(c)));
  const hasDraft = changedGroups.length > 0;

  function place(c: ConsoleName, id: string, toIndex: number) {
    const order = shownOrder(c).filter((x) => x !== id);
    order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, id);
    setOrderError(null);
    setNotice(null);
    setDrafts((d) => ({ ...d, [c]: order }));
  }

  async function saveOrder() {
    setOrderError(null);
    setNotice(null);
    try {
      for (const c of changedGroups) {
        await reorder.mutateAsync({ console: c, menuIds: shownOrder(c) });
      }
      setDrafts({});
      setNotice("Saved the new order.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "MENU_ORDER_OUTDATED") {
        // The list changed while this was being arranged: the list was reloaded; start again from it.
        setDrafts({});
        setOrderError("The list changed while you were arranging it (a release changed the entries). It has been reloaded — arrange it again.");
      } else {
        setOrderError(errorText(err));
      }
    }
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
      <h1 className="text-xl font-semibold text-gray-900">Menus</h1>
      <p className="mt-1 text-sm text-gray-600">
        The sidebar entries and their order. Drag a row by its handle (or use the arrows), then Save order. Which
        roles get which entry is set on each role's Menus tab.
      </p>

      {notice && (
        <p role="status" className="mt-3 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          {notice}
        </p>
      )}

      {orderError && (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {orderError}
        </p>
      )}

      {hasDraft && (
        <div
          role="group"
          aria-label="Unsaved order"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
        >
          <span>
            <strong>Order changed — not saved yet.</strong> Drag a row by its handle, or use the arrows.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveOrder()}
              disabled={reorder.isPending}
              className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {reorder.isPending ? "Saving…" : "Save order"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDrafts({});
                setOrderError(null);
              }}
              disabled={reorder.isPending}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Reset
            </button>
          </span>
        </div>
      )}

      <table className="mt-4 w-full border-collapse overflow-hidden rounded-md border border-gray-200 bg-white text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="w-8 px-2 py-2" />
            <th className="px-2 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Label</th>
            <th className="px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 font-medium">Path</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        {GROUPS.map((group) => {
          const order = shownOrder(group.console);
          const items = order.map((id) => byId.get(id)).filter((m): m is Menu => !!m);
          if (items.length === 0) return null;
          return (
            <tbody key={group.console} aria-label={group.title} className="divide-y divide-gray-100">
              <tr className="bg-gray-50">
                <th colSpan={7} scope="colgroup" className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {group.title}
                </th>
              </tr>
              {items.map((menu, index) => {
                const locked = isProtected(menu);
                const busy = pendingId === menu.id;
                const sameGroupDrag = dragging?.console === menu.console;
                const rowClass = [
                  flash?.highlight === menu.menuKey && !hasDraft ? "bg-blue-50" : "",
                  dragging?.id === menu.id ? "opacity-40" : "",
                  overId === menu.id && sameGroupDrag && dragging?.id !== menu.id ? "outline outline-2 -outline-offset-2 outline-blue-400" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <tr
                    key={menu.id}
                    className={rowClass || undefined}
                    onDragOver={(e) => {
                      // Only a row of the SAME group is a drop target; anything else leaves the drop refused.
                      if (dragging && dragging.console === menu.console) {
                        e.preventDefault();
                        if (overId !== menu.id) setOverId(menu.id);
                      }
                    }}
                    onDrop={(e) => {
                      if (!dragging || dragging.console !== menu.console) return;
                      e.preventDefault();
                      if (dragging.id !== menu.id) place(menu.console, dragging.id, index);
                      setDragging(null);
                      setOverId(null);
                    }}
                  >
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        draggable
                        tabIndex={-1}
                        aria-label={`Drag ${menu.label} to reorder`}
                        title="Drag to reorder (or use the arrows)"
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", menu.id);
                          e.dataTransfer.effectAllowed = "move";
                          const row = e.currentTarget.closest("tr");
                          if (row && e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(row, 16, 16);
                          setDragging({ id: menu.id, console: menu.console });
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOverId(null);
                        }}
                        className="cursor-grab select-none rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 active:cursor-grabbing"
                      >
                        ⋮⋮
                      </button>
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-500">{index + 1}</td>
                    <td className={`px-3 py-2 ${menu.isActive ? "text-gray-900" : "text-gray-400"}`}>
                      <span className="inline-flex items-center gap-2">
                        <MenuIcon name={menu.icon} className={`h-5 w-5 ${menu.isActive ? "" : "opacity-50"}`} />
                        <span className={menu.isActive ? "" : "line-through"}>{menu.label}</span>
                        {locked && <LockClosedIcon className="h-3.5 w-3.5 text-gray-400" aria-label={PROTECTED_HINT} />}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{menu.menuKey}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{menu.path}</td>
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
                      <button
                        type="button"
                        onClick={() => place(menu.console, menu.id, index - 1)}
                        disabled={index === 0 || reorder.isPending}
                        aria-label={`Move ${menu.label} up`}
                        className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-30"
                      >
                        ▲
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() => place(menu.console, menu.id, index + 1)}
                        disabled={index === items.length - 1 || reorder.isPending}
                        aria-label={`Move ${menu.label} down`}
                        className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-30"
                      >
                        ▼
                      </button>{" "}
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

    </div>
  );
}
