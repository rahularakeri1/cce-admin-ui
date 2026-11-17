# API Integration Reference — Admin UI

The authoritative contract is
[cce-admin-service/docs/api-reference.md](../../cce-admin-service/docs/api-reference.md) — this
document covers only the UI-side conventions for calling it. Don't duplicate endpoint shapes here;
link to that document and keep this one about the client, hooks and error handling.

---

## 1. API Client

```typescript
// src/api/client.ts
import { getToken } from '../auth/keycloak';

const BASE_URL = `${import.meta.env.VITE_API_BASE_URL ?? ''}/admin/v1`;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Accept': 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${getToken()}`,
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText);
  }
  return body.data as T; // envelope unwrapped here — callers never see { data, pagination }
}
```

One module per resource (`api/users.ts`, `api/roles.ts`, `api/menus.ts`), each a thin set of typed
functions calling `request()` — no fetch calls outside `api/` (F-02).

Pagination responses keep the `pagination` block alongside `data`; list-endpoint functions return
`{ items: T[]; pagination: PaginationMeta }` rather than unwrapping it away, since list hooks need
`total`/`page`/`pageSize` for TanStack Table.

## 2. TanStack Query Hooks

One hook per endpoint (or tight group), in `hooks/`. Pages never import `api/` directly (F-01–F-06,
architecture-overview.md §3).

```typescript
// hooks/useUsers.ts
export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => listUsers(filters),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUserRoles(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleIds: string[]) => replaceUserRoles(userId, roleIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', userId] });
      qc.invalidateQueries({ queryKey: ['users'] }); // list shows role names too
    },
  });
}
```

No `onMutate` optimistic cache writes anywhere in this app (F-06) — every mutation hook invalidates
on success only.

## 3. Error Handling by `error.code`

Each form/screen switches on `ApiError.code`, not just `status`, since several codes share an HTTP
status (`409` covers `DUPLICATE_ROLE_NAME`, `DUPLICATE_MENU_KEY`, `EMAIL_IN_USE`, `ROLE_IN_USE`,
`SYSTEM_ROLE_IMMUTABLE` — see
[api-reference.md § Error codes](../../cce-admin-service/docs/api-reference.md#error-codes)):

```typescript
try {
  await createUser.mutateAsync(formValues);
} catch (e) {
  if (e instanceof ApiError) {
    if (e.code === 'EMAIL_IN_USE') setFieldError('email', 'Email already in use');
    else if (e.code === 'KEYCLOAK_SYNC_FAILED') setShowSyncFailure(true); // shared component
    else setFormError(e.message);
  }
}
```

`KEYCLOAK_SYNC_FAILED` is handled by one shared component imported in both the user-create form and
the Role Detail → Permissions tab (architecture-overview.md §4) — do not re-implement its copy/retry
affordance per screen.

## 4. Auth Headers

`client.ts` always attaches `Authorization: Bearer <token>` from the live Keycloak session — there is
no `authEnabled` flag to check first, unlike `cce-insights-ui`. A request made before `initAuth()`
resolves should not be possible, since `main.tsx` blocks render until login completes (F-01).

## 5. MSW Mocking (local/test)

MSW handlers in `src/mocks/handlers.ts` mirror the examples in
[api-reference.md](../../cce-admin-service/docs/api-reference.md) exactly, including error-code
bodies — in particular a handler that returns `502 KEYCLOAK_SYNC_FAILED` on demand (toggleable per
test) so the sync-failure UI path is exercised without a real Keycloak/gateway dependency.

## 6. CORS

Local dev proxies `/admin/v1/*` to `localhost:8085` via Vite's dev server config — no CORS headers
needed locally. In deployed environments, all calls route through `gateway-service`
(architecture-overview.md §1), which already serves `cce-insights-ui` cross-origin; no new CORS
configuration should be needed, but confirm against `gateway-service`'s CORS origin list
(`deploy-scripts/k8s/base/services/gateway-service.yaml`'s CORS env var) before first deploy.
