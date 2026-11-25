import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { ApiError } from "../api/client";
import type { User } from "../api/users";
import { InlineForbidden } from "../components/InlineForbidden";
import { SyncFailedNotice } from "../components/SyncFailedNotice";
import { useMe } from "../hooks/useMe";
import { useReplaceUserRoles, useResetUserPassword, useSetUserStatus, useUpdateUser, useUser } from "../hooks/useUser";
import { useRoles } from "../hooks/useRoles";
import { updateUserSchema, type UpdateUserForm } from "../schemas/user";

const card = "rounded-md border border-gray-200 bg-white p-4";
const h2 = "text-sm font-semibold text-gray-900";
const primary = "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const secondary = "rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";

/** Renders one action's failure on its own surface: 403 inline, 502 as the shared notice, else the message. */
function ActionError({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 403) return <InlineForbidden message="You don't have permission for this action." />;
  if (error.code === "KEYCLOAK_SYNC_FAILED") return <SyncFailedNotice variant="not-saved" />;
  return (
    <p role="alert" className="text-sm text-red-700">
      {error.message}
    </p>
  );
}

function ProfileSection({ user, readOnly }: { user: User; readOnly: boolean }) {
  const update = useUpdateUser(user.id);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<UpdateUserForm>({
    resolver: zodResolver(updateUserSchema),
    values: { firstName: user.firstName, lastName: user.lastName, email: user.email, facilityScope: user.facilityScope ?? "" },
    resetOptions: { keepDirtyValues: true },
  });
  const emailChanging = watch("email")?.trim().toLowerCase() !== user.email;

  const onSubmit = handleSubmit((values) => {
    setSaved(false);
    setWarnings([]);
    update.mutate(
      { ...values, facilityScope: values.facilityScope?.trim() || undefined },
      {
        onSuccess: ({ user: next, warnings: w }) => {
          setWarnings(w);
          setSaved(true);
          reset({ firstName: next.firstName, lastName: next.lastName, email: next.email, facilityScope: next.facilityScope ?? "" });
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "EMAIL_IN_USE") {
            setError("email", { type: "server", message: "Another user already has this email" });
          }
        },
      },
    );
  });

  const input = (id: keyof UpdateUserForm, label: string) => (
    <div>
      <label htmlFor={`p-${id}`} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={`p-${id}`}
        autoComplete="off"
        readOnly={readOnly}
        aria-invalid={errors[id] ? "true" : "false"}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm read-only:bg-gray-50 read-only:text-gray-600"
        {...register(id)}
      />
      {errors[id] && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {errors[id]?.message}
        </p>
      )}
    </div>
  );

  const showApiError = update.error && !(update.error instanceof ApiError && update.error.code === "EMAIL_IN_USE");

  return (
    <section aria-labelledby="sec-profile" className={card}>
      <h2 id="sec-profile" className={h2}>
        Profile
      </h2>
      <form onSubmit={onSubmit} noValidate className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {input("firstName", "First name")}
          {input("lastName", "Last name")}
        </div>
        {input("email", "Email")}
        {emailChanging && (
          <p className="text-xs text-amber-700">
            Changing the email marks it unverified and sends a verification email to the new address. They will need to sign in again.
          </p>
        )}
        {input("facilityScope", "Facility")}
        <p className="text-xs text-gray-500">
          Username <span className="font-mono">{user.username}</span> is permanent.
        </p>
        {showApiError && <ActionError error={update.error} />}
        {warnings.map((w) => (
          <div key={w} role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ⚠ {w}
          </div>
        ))}
        {saved && warnings.length === 0 && (
          <p role="status" className="text-sm text-green-700">
            Profile saved.
          </p>
        )}
        {!readOnly && (
          <button type="submit" disabled={!isDirty || update.isPending} className={primary}>
            {update.isPending ? "Saving…" : "Save profile"}
          </button>
        )}
      </form>
    </section>
  );
}

function RolesSection({ user, readOnly }: { user: User; readOnly: boolean }) {
  const roles = useRoles();
  const save = useReplaceUserRoles(user.id);
  const current = new Set(roles.data?.filter((r) => user.roles.includes(r.name)).map((r) => r.id) ?? []);
  // null = no local edits; the boxes then mirror what the server last returned.
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const selected = draft ?? current;
  const changed = draft !== null && (draft.size !== current.size || [...draft].some((id) => !current.has(id)));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(next);
  }

  return (
    <section aria-labelledby="sec-roles" className={card}>
      <h2 id="sec-roles" className={h2}>
        Roles
      </h2>
      {roles.isLoading && <p className="mt-2 text-sm text-gray-500">Loading roles…</p>}
      <ul className="mt-3 space-y-1">
        {roles.data?.map((r) => (
          <li key={r.id}>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} disabled={save.isPending || readOnly} />
              <span className="font-mono">{r.name}</span>
              <span className="text-gray-500">{r.displayName}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        <ActionError error={save.error} />
        {!readOnly && (
        <button
          type="button"
          disabled={!changed || save.isPending}
          className={primary}
          // Always the COMPLETE set; the server works out the delta and touches only the changed roles in Keycloak.
          onClick={() => save.mutate([...selected].sort(), { onSuccess: () => setDraft(null) })}
        >
          {save.isPending ? "Saving…" : "Save roles"}
        </button>
        )}
      </div>
    </section>
  );
}

function StatusSection({ user, isSelf }: { user: User; isSelf: boolean }) {
  // System accounts never get an action here — the server would refuse it anyway.
  const setStatus = useSetUserStatus(user.id);
  const [confirming, setConfirming] = useState(false);
  const active = user.status === "ACTIVE";

  return (
    <section aria-labelledby="sec-status" className={card}>
      <h2 id="sec-status" className={h2}>
        Status
      </h2>
      <p className="mt-2 text-sm text-gray-700">
        This account is <span className="font-medium">{active ? "Active" : "Inactive"}</span>.{" "}
        {active ? "Deactivating signs them out and blocks sign-in; their roles are kept." : "Reactivating restores their access with the same roles."}
      </p>
      <div className="mt-3 space-y-2">
        <ActionError error={setStatus.error} />
        {user.isSystem && <p className="text-sm text-gray-600">System accounts can't be deactivated from the console.</p>}
        {!user.isSystem && active && isSelf && <p className="text-sm text-gray-600">You can't deactivate your own account.</p>}
        {!user.isSystem && !(active && isSelf) && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} className={active ? secondary : primary}>
            {active ? "Deactivate user" : "Reactivate user"}
          </button>
        )}
        {!user.isSystem && !(active && isSelf) && confirming && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-800">
              {active ? `Deactivate ${user.firstName} ${user.lastName}?` : `Reactivate ${user.firstName} ${user.lastName}?`}
            </span>
            <button
              type="button"
              disabled={setStatus.isPending}
              className={primary}
              onClick={() => setStatus.mutate(active ? "INACTIVE" : "ACTIVE", { onSettled: () => setConfirming(false) })}
            >
              {setStatus.isPending ? "Working…" : active ? "Confirm deactivate" : "Confirm reactivate"}
            </button>
            <button type="button" onClick={() => { setStatus.reset(); setConfirming(false); }} className={secondary}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function PasswordSection({ user }: { user: User }) {
  const reset = useResetUserPassword(user.id);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  const neverLoggedIn = user.lastLoginAt === null;
  const active = user.status === "ACTIVE";

  return (
    <section aria-labelledby="sec-password" className={card}>
      <h2 id="sec-password" className={h2}>
        Password &amp; invitation
      </h2>
      <p className="mt-2 text-sm text-gray-700">
        {neverLoggedIn
          ? "This user has never signed in. Resend the invitation so they can verify their email and set a password."
          : "Send a fresh link to verify their email and set a new password. No password is shown or stored here."}{" "}
        The link is valid for 72 hours and replaces any earlier one.
      </p>
      <div className="mt-3 space-y-2">
        <ActionError error={reset.error} />
        {sent && (
          <p role="status" className="text-sm text-green-700">
            Email sent to {user.email}.
          </p>
        )}
        {!active && <p className="text-sm text-gray-600">Reactivate this user first — an inactive account can't use the link.</p>}
        {active && !confirming && (
          <button type="button" onClick={() => { setSent(false); setConfirming(true); }} className={secondary}>
            {neverLoggedIn ? "Resend invitation" : "Send password reset email"}
          </button>
        )}
        {active && confirming && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-800">Email a link to {user.email}?</span>
            <button
              type="button"
              disabled={reset.isPending}
              className={primary}
              onClick={() => reset.mutate(undefined, { onSuccess: () => setSent(true), onSettled: () => setConfirming(false) })}
            >
              {reset.isPending ? "Sending…" : "Confirm send"}
            </button>
            <button type="button" onClick={() => { reset.reset(); setConfirming(false); }} className={secondary}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default function UserDetailPage() {
  const { id = "" } = useParams();
  const { data: user, isLoading, error } = useUser(id);
  const me = useMe();

  if (isLoading) return <p className="text-sm text-gray-500">Loading user…</p>;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div>
        <p className="text-sm text-gray-700">User not found.</p>
        <Link to="/users" className="text-sm font-medium text-blue-700 hover:underline">
          Back to users
        </Link>
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 403) return <InlineForbidden message="You can't view this user." />;
  if (error || !user) return <p role="alert" className="text-sm text-red-700">Could not load this user — try reloading.</p>;

  const needsAttention = user.status === "ACTIVE" && user.lastLoginAt === null;
  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/users" className="text-sm text-blue-700 hover:underline">
        ← Users
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {user.firstName} {user.lastName}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          <span className="font-mono">{user.username}</span> {user.isSystem && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-800">System</span>} · {user.email} · {user.status === "ACTIVE" ? "Active" : "Inactive"} · last login{" "}
          {user.lastLoginAt ? format(new Date(user.lastLoginAt), "yyyy-MM-dd HH:mm") : "never"}
          {needsAttention && (
            <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Needs attention</span>
          )}
        </p>
      </div>
      {/* Four independent actions — each its own button, pending state and error surface (F-11). */}
      {user.isSystem && (
        <div role="note" className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-medium">System account</p>
          <p className="mt-1">
            Created by the platform. It can't be edited, deactivated or have its roles changed from the console — doing so could lock
            everyone out. You can still send it a password reset email.
          </p>
        </div>
      )}
      <ProfileSection user={user} readOnly={user.isSystem} />
      <RolesSection user={user} readOnly={user.isSystem} />
      <StatusSection user={user} isSelf={me.data?.id === user.id} />
      <PasswordSection user={user} />
    </div>
  );
}
