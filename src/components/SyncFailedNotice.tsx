// The ONE shared component for KEYCLOAK_SYNC_FAILED — reused on the Permissions tab (F-14) and the
// user-create form (F-11). Never a generic toast (F-05).
//
// Two wordings, because the two situations differ in what survived:
//  - "saved":     the change IS stored, only Keycloak is behind -> offer Re-sync (Permissions tab)
//  - "not-saved": the whole operation was rolled back, nothing was stored -> just try again
export function SyncFailedNotice({
  onRetry,
  retrying = false,
  variant = "saved",
}: {
  onRetry?: () => void;
  retrying?: boolean;
  variant?: "saved" | "not-saved";
}) {
  const saved = variant === "saved";
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">
        {saved
          ? "Sync failed — your change was saved, but Keycloak hasn't caught up yet."
          : "Keycloak sync failed — nothing was saved."}
      </p>
      <p className="mt-1 text-amber-800">
        {saved
          ? "The data is safely stored. Use Re-sync to try reaching Keycloak again."
          : "No user was created. Check that Keycloak is reachable, then submit the form again."}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-2 rounded border border-amber-400 bg-white px-3 py-1 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {retrying ? "Re-syncing…" : "Re-sync"}
        </button>
      )}
    </div>
  );
}
