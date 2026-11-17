// Shown inline on the screen that made the call — never a global error page (F-04).
export function InlineForbidden({ message }: { message?: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-medium">You don't have permission to do this.</p>
      {message && <p className="mt-1 text-red-700">{message}</p>}
    </div>
  );
}
