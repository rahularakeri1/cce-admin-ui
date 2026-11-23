import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ApiError } from "../api/client";
import type { Role } from "../api/roles";
import { InlineForbidden } from "../components/InlineForbidden";
import { useCreateRole, useDeleteRole, useRoles } from "../hooks/useRoles";
import { createRoleSchema, type CreateRoleForm } from "../schemas/role";

function CreateRoleFormPanel({ onDone }: { onDone: () => void }) {
  const create = useCreateRole();
  const [formError, setFormError] = useState<ApiError | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateRoleForm>({ resolver: zodResolver(createRoleSchema) });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    create.mutate(
      { name: values.name, displayName: values.displayName.trim(), description: values.description?.trim() || undefined },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (err instanceof ApiError && err.code === "DUPLICATE_ROLE_NAME") {
            // Even when client-side validation passed — another admin may have just created it.
            setError("name", { type: "server", message: "A role with this name already exists" });
          } else if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
            setError("name", { type: "server", message: err.message });
          } else if (err instanceof ApiError) {
            setFormError(err);
          }
        },
      },
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mb-6 space-y-4 rounded-md border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">New role</h2>

      <div>
        <label htmlFor="role-name" className="block text-sm font-medium text-gray-700">
          Name *
        </label>
        <input
          id="role-name"
          type="text"
          autoComplete="off"
          placeholder="UPPER_SNAKE_CASE"
          aria-invalid={errors.name ? "true" : "false"}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
          {...register("name")}
        />
        <p className="mt-1 text-xs text-amber-700">⚠ Name is permanent — it cannot be renamed after creation.</p>
        {errors.name && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="role-display-name" className="block text-sm font-medium text-gray-700">
          Display name *
        </label>
        <input
          id="role-display-name"
          type="text"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("displayName")}
        />
        {errors.displayName && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {errors.displayName.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="role-description" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="role-description"
          rows={2}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("description")}
        />
      </div>

      {formError?.status === 403 && <InlineForbidden message="You can't create roles." />}
      {formError && formError.status !== 403 && (
        <p role="alert" className="text-sm text-red-700">
          {formError.message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create role"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function RoleRow({ role }: { role: Role }) {
  const del = useDeleteRole();
  const [confirming, setConfirming] = useState(false);
  const error = del.error instanceof ApiError ? del.error : null;

  return (
    <tr className="border-t border-gray-100">
      <td className="px-4 py-3 font-mono text-sm text-gray-900">
        <span className="inline-flex items-center gap-2">
          {role.isSystem && <LockClosedIcon className="h-4 w-4 text-gray-400" aria-label="System role (locked)" />}
          {role.name}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{role.displayName}</td>
      <td className="px-4 py-3 text-sm">
        {/* System roles get NO delete affordance at all — not a disabled one (F-12). */}
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`/roles/${role.id}`} className="font-medium text-blue-700 hover:underline">
            view
          </Link>
          {!role.isSystem && !confirming && (
            <button type="button" onClick={() => setConfirming(true)} className="font-medium text-red-700 hover:underline">
              Delete
            </button>
          )}
          {!role.isSystem && confirming && (
            <span className="inline-flex items-center gap-2">
              <span className="text-gray-700">Delete {role.name}?</span>
              <button
                type="button"
                disabled={del.isPending}
                onClick={() => del.mutate(role.id, { onSuccess: () => setConfirming(false) })}
                className="rounded border border-red-300 bg-red-50 px-2 py-0.5 font-medium text-red-800 disabled:opacity-50"
              >
                {del.isPending ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                type="button"
                onClick={() => {
                  del.reset();
                  setConfirming(false);
                }}
                className="text-gray-600 hover:underline"
              >
                Cancel
              </button>
            </span>
          )}
        </div>
        {error?.status === 403 && <div className="mt-2"><InlineForbidden message="You can't delete roles." /></div>}
        {error && error.status !== 403 && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {error.code === "ROLE_IN_USE" ? "Can't delete: users still hold this role. Reassign them first." : error.message}
          </p>
        )}
      </td>
    </tr>
  );
}

export default function RolesListPage() {
  const { data: roles, isLoading, error } = useRoles();
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Roles</h1>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New Role
          </button>
        )}
      </div>

      {showForm && <CreateRoleFormPanel onDone={() => setShowForm(false)} />}

      {isLoading && <p className="text-sm text-gray-500">Loading roles…</p>}
      {error instanceof ApiError && error.status === 403 && <InlineForbidden message="You can't view roles." />}
      {error && !(error instanceof ApiError && error.status === 403) && (
        <p role="alert" className="text-sm text-red-700">
          Could not load roles — try reloading.
        </p>
      )}

      {roles && (
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Display name</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <RoleRow key={role.id} role={role} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
