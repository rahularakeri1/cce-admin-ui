// The ONE shared component for KEYCLOAK_SYNC_FAILED — reused on the user-create form (F-11) and
// the Permissions tab (F-14). Never a generic toast (F-05).
export function SyncFailedNotice({ onRetry, retrying = false }: { onRetry?: () => void; retrying?: boolean }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">Sync failed — your change was saved, but Keycloak hasn't caught up yet.</p>
      <p className="mt-1 text-amber-800">
        The data is safely stored. Use Re-sync to try reaching Keycloak again.
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
