import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "../api/client";
import type { CreatedUser } from "../api/users";
import { InlineForbidden } from "../components/InlineForbidden";
import { SyncFailedNotice } from "../components/SyncFailedNotice";
import { useRoles } from "../hooks/useRoles";
import { useCreateUser } from "../hooks/useUsers";
import { createUserSchema, type CreateUserForm } from "../schemas/user";

export default function UserCreatePage() {
  const roles = useRoles();
  const create = useCreateUser();
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [formError, setFormError] = useState<ApiError | null>(null);
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<CreateUserForm>({ resolver: zodResolver(createUserSchema) });

  const toggleRole = (id: string) => {
    setRolesError(null);
    setRoleIds((current) => (current.includes(id) ? current.filter((r) => r !== id) : [...current, id]));
  };

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    setRolesError(null);
    create.mutate(
      { ...values, facilityScope: values.facilityScope?.trim() || undefined, roleIds },
      {
        onSuccess: (result) => setCreated(result),
        onError: (err) => {
          if (!(err instanceof ApiError)) return;
          // Server-side outcomes surface on the field they're about, even though client validation passed.
          if (err.code === "EMAIL_IN_USE") setError("email", { type: "server", message: "A user with this email already exists" });
          else if (err.code === "USERNAME_IN_USE") setError("username", { type: "server", message: "This username is already taken" });
          else if (err.code === "ROLE_NOT_SYNCED") setRolesError(err.message);
          else setFormError(err);
        },
      },
    );
  });

  function another() {
    reset();
    setRoleIds([]);
    setCreated(null);
    create.reset();
  }

  if (created) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-gray-900">User created</h1>
        <div role="status" className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <p className="font-medium">
            {created.user.firstName} {created.user.lastName} ({created.user.email}) was created
            {created.user.roles.length > 0 ? ` with ${created.user.roles.join(", ")}` : " with no roles"}.
          </p>
        </div>
        {created.warnings.map((w) => (
          <div key={w} role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            ⚠ {w}
          </div>
        ))}
        {created.warnings.length === 0 && (
          <p className="mt-3 text-sm text-gray-600">An invitation email was sent. The link is valid for 72 hours.</p>
        )}
        <div className="mt-5 flex gap-3">
          <Link to="/users" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Back to users
          </Link>
          <button type="button" onClick={another} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Create another
          </button>
        </div>
      </div>
    );
  }

  const field = (id: keyof CreateUserForm, label: string, opts: { required?: boolean; type?: string } = {}) => (
    <div>
      <label htmlFor={`u-${id}`} className="block text-sm font-medium text-gray-700">
        {label}
        {opts.required ? " *" : ""}
      </label>
      <input
        id={`u-${id}`}
        type={opts.type ?? "text"}
        autoComplete="off"
        aria-invalid={errors[id] ? "true" : "false"}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        {...register(id)}
      />
      {errors[id] && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {errors[id]?.message}
        </p>
      )}
    </div>
  );

  return (
    <div className="max-w-xl">
      <Link to="/users" className="text-sm text-blue-700 hover:underline">
        ← Users
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-gray-900">New user</h1>
      <p className="mt-1 text-sm text-gray-600">
        Creates the account in Keycloak and sends an invitation email so they can verify their address and set a password.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4 rounded-md border border-gray-200 bg-white p-4">
        {field("username", "Username", { required: true })}
        {field("email", "Email", { required: true, type: "email" })}
        <div className="grid grid-cols-2 gap-4">
          {field("firstName", "First name", { required: true })}
          {field("lastName", "Last name", { required: true })}
        </div>
        {field("facilityScope", "Facility")}

        <fieldset>
          <legend className="block text-sm font-medium text-gray-700">Roles</legend>
          {roles.isLoading && <p className="mt-1 text-sm text-gray-500">Loading roles…</p>}
          {roles.data && roles.data.length === 0 && <p className="mt-1 text-sm text-gray-500">No roles yet — create one first.</p>}
          <ul className="mt-1 space-y-1">
            {roles.data?.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} />
                  <span className="font-mono">{r.name}</span>
                  <span className="text-gray-500">{r.displayName}</span>
                </label>
              </li>
            ))}
          </ul>
          {rolesError && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {rolesError}
            </p>
          )}
        </fieldset>

        {formError?.status === 403 && <InlineForbidden message="You can't create users." />}
        {formError?.code === "KEYCLOAK_SYNC_FAILED" && <SyncFailedNotice variant="not-saved" />}
        {formError && formError.status !== 403 && formError.code !== "KEYCLOAK_SYNC_FAILED" && (
          <p role="alert" className="text-sm text-red-700">
            {formError.message}
          </p>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create user"}
        </button>
      </form>
    </div>
  );
}
