import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ApiError } from "../api/client";
import type { Menu } from "../api/menus";
import { InlineForbidden } from "../components/InlineForbidden";
import { useCreateMenu, useMenuCatalog, useUpdateMenu } from "../hooks/useMenus";
import { menuFormSchema, type MenuForm } from "../schemas/menu";

const input = "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
const readOnly = "bg-gray-100 text-gray-500";

/** Add (no `existing`) or edit one entry. The key is permanent; an admin tab's path and active flag are fixed. */
function MenuFormFields({ existing }: { existing?: Menu }) {
  const navigate = useNavigate();
  const create = useCreateMenu();
  const update = useUpdateMenu();
  const [formError, setFormError] = useState<ApiError | null>(null);
  const protectedTab = existing?.console === "ADMIN";
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<MenuForm>({
    resolver: zodResolver(menuFormSchema),
    defaultValues: {
      menuKey: existing?.menuKey ?? "",
      label: existing?.label ?? "",
      path: existing?.path ?? "",
      icon: existing?.icon ?? "",
      isActive: existing?.isActive ?? true,
    },
  });
  const pending = create.isPending || update.isPending;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const payload = {
      menuKey: existing?.menuKey ?? values.menuKey,
      label: values.label.trim(),
      path: protectedTab ? existing.path : values.path.trim(),
      icon: values.icon?.trim() || undefined,
      // No sortOrder, ever: an update leaves the position alone and a new entry goes to the end of Insights. Entries
      // are arranged by dragging them on the Menus screen.
      isActive: protectedTab ? true : values.isActive,
    };
    const onError = (err: unknown) => {
      if (err instanceof ApiError && err.code === "DUPLICATE_MENU_KEY") {
        // Even when it looked free: another admin may have just created it.
        setError("menuKey", { type: "server", message: `Key already in use: ${payload.menuKey}. Pick another.` });
      } else if (err instanceof ApiError) {
        setFormError(err);
      }
    };
    if (existing) {
      update.mutate(
        { id: existing.id, input: payload },
        { onSuccess: () => navigate("/menus", { state: { saved: `Saved “${payload.label}”.`, highlight: payload.menuKey } }), onError },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () =>
          navigate("/menus", {
            state: {
              saved: `Added “${payload.label}” at the end of Insights. Drag it into place, then assign it to roles on the Roles screen.`,
              highlight: payload.menuKey,
            },
          }),
        onError,
      });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 max-w-2xl space-y-4 rounded-md border border-gray-200 bg-white p-4">
      {protectedTab && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This is one of the console's own tabs, so its key and path are fixed and it can't be deactivated.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="menu-key" className="block text-sm font-medium text-gray-700">
            Key *
            {existing && <LockClosedIcon className="ml-1 inline h-3.5 w-3.5 text-gray-400" aria-label="Permanent" />}
          </label>
          <input
            id="menu-key"
            type="text"
            autoComplete="off"
            placeholder="e.g. reports"
            readOnly={!!existing}
            aria-readonly={!!existing}
            aria-invalid={errors.menuKey ? "true" : "false"}
            className={`${input} font-mono ${existing ? readOnly : ""}`}
            {...register("menuKey")}
          />
          <p className="mt-1 text-xs text-gray-500">
            {existing ? "Fixed once created: roles and code refer to it." : "Lower-case, unique. Can't be changed later."}
          </p>
          {errors.menuKey && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {errors.menuKey.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="menu-label" className="block text-sm font-medium text-gray-700">
            Label *
          </label>
          <input id="menu-label" type="text" placeholder="e.g. Reports" aria-invalid={errors.label ? "true" : "false"} className={input} {...register("label")} />
          <p className="mt-1 text-xs text-gray-500">What the sidebar shows.</p>
          {errors.label && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {errors.label.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="menu-path" className="block text-sm font-medium text-gray-700">
            Path *
            {protectedTab && <LockClosedIcon className="ml-1 inline h-3.5 w-3.5 text-gray-400" aria-label="Fixed" />}
          </label>
          <input
            id="menu-path"
            type="text"
            placeholder="e.g. /reports"
            readOnly={protectedTab}
            aria-readonly={protectedTab}
            aria-invalid={errors.path ? "true" : "false"}
            className={`${input} font-mono ${protectedTab ? readOnly : ""}`}
            {...register("path")}
          />
          {errors.path && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {errors.path.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="menu-icon" className="block text-sm font-medium text-gray-700">
            Icon
          </label>
          <input id="menu-icon" type="text" placeholder="e.g. ChartBarIcon" aria-invalid={errors.icon ? "true" : "false"} className={`${input} font-mono`} {...register("icon")} />
          <p className="mt-1 text-xs text-gray-500">A Heroicons name.</p>
          {errors.icon && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {errors.icon.message}
            </p>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700">Console</span>
          <p className={`${input} ${readOnly}`}>
            {existing?.console === "ADMIN" ? "Admin console" : "Insights"}
            <LockClosedIcon className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />
          </p>
          <p className="mt-1 text-xs text-gray-500">
            New entries are Insights and go to the end of the list — drag them into place on the Menus screen. The admin
            console's tabs come from a migration.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-800">
        <input type="checkbox" disabled={protectedTab} {...register("isActive")} />
        Active
        <span className="text-xs text-gray-500">
          {protectedTab ? "(always on for this tab)" : "(untick to hide it from every sidebar; role assignments are kept)"}
        </span>
      </label>

      {formError &&
        (formError.status === 403 ? (
          <InlineForbidden message="You can't change menus." />
        ) : (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {formError.status === 404 ? "This menu no longer exists." : formError.message}
          </p>
        ))}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <Link to="/menus" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Cancel
        </Link>
      </div>
    </form>
  );
}

export default function MenuFormPage() {
  const { id } = useParams();
  const catalog = useMenuCatalog();
  const back = (
    <Link to="/menus" className="text-sm text-blue-700 hover:underline">
      ← Menus
    </Link>
  );

  if (!id) {
    return (
      <div>
        {back}
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Add menu</h1>
        <MenuFormFields />
      </div>
    );
  }

  if (catalog.isLoading) return <p className="text-sm text-gray-500">Loading menu…</p>;
  if (catalog.error instanceof ApiError && catalog.error.status === 403) {
    return <InlineForbidden message="You can't view the menu catalog." />;
  }
  const existing = catalog.data?.find((m) => m.id === id);
  if (catalog.error || !catalog.data) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Could not load this menu — try reloading.
      </p>
    );
  }
  if (!existing) {
    return (
      <div>
        {back}
        <p role="alert" className="mt-3 text-sm text-gray-700">
          Menu not found.
        </p>
      </div>
    );
  }
  return (
    <div>
      {back}
      <h1 className="mt-2 text-xl font-semibold text-gray-900">Edit “{existing.label}”</h1>
      {/* key: the form is remounted if the entry changes underneath it (e.g. after a refetch) */}
      <MenuFormFields key={`${existing.id}-${existing.label}-${existing.sortOrder}-${existing.isActive}`} existing={existing} />
    </div>
  );
}
