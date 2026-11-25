# Architecture Overview — Admin UI

> **CCE Admin UI** — Platform administration console (users, roles, menus, API permissions)
> **Status**: Design stage — no code yet.

Derived from `CCE_Admin_Module_PRD.pdf` §6, §8 and the sibling service's
[cce-admin-service/docs/architecture-overview.md](../../cce-admin-service/docs/architecture-overview.md),
which is the source of truth for the API this console calls. Where this document and that one
disagree, treat it as a bug in this document.

This console intentionally mirrors `cce-insights-ui`'s stack and conventions (same Keycloak PKCE
pattern, same TanStack Query usage, same Tailwind setup) since it's a peer console behind the same
`gateway-service` — see `cce-insights-ui/docs/architecture-overview.md` for the pattern this was
modeled on. The differences are deliberate, not oversights, and are called out explicitly below.

---

## 1. System Context

```mermaid
graph LR
    subgraph "Browser"
        AUI[Admin UI<br/>React 18 SPA<br/>port 3002]
    end
    subgraph "CCE Platform"
        KC[Keycloak<br/>realm cce]
        GW[gateway-service<br/>port 8090]
        AS[cce-admin-service<br/>port 8085]
    end

    AUI -- "1. PKCE login, client cce-admin-ui" --> KC
    AUI -- "2. Bearer /admin/v1/**" --> GW
    GW -- "3. proxy" --> AS

    style AUI fill:#3b82f6,color:#fff
    style GW fill:#8b5cf6,color:#fff
    style AS fill:#10b981,color:#fff
```

Unlike `cce-insights-ui`, authentication here is **mandatory**, not a build-time toggle — there is no
`VITE_AUTH_ENABLED=false` escape hatch (F-01). A platform administration console with no auth bypass
is a deliberate hardening choice, not an oversight; don't carry the insights-ui pattern over here.

## 2. Technology Stack

| Layer | Technology | Version | Notes vs. `cce-insights-ui` |
|---|---|---|---|
| Framework | React | 18.x | Same |
| Language | TypeScript | 5.x | Same |
| Build | Vite | 6.x | Same |
| Routing | React Router | 7.x | Same |
| Server state | TanStack Query | 5.x | Same — **no optimistic updates anywhere** (F-06), unlike patterns that assume client-side cache patching |
| Forms | React Hook Form 7 + Zod 3 | — | New — `cce-insights-ui` is read-only and has no forms |
| Tables | TanStack Table | 8.x | Same |
| Styling | Tailwind CSS | 4.x | Same |
| Icons | Heroicons | 2.x | Same |
| Dates | date-fns | 4.x | Same |
| Auth | `keycloak-js` 26, Authorization Code + PKCE (S256) | — | Same library; **mandatory**, own client id `cce-admin-ui`, `updateToken(70)` every 60s |
| Testing | Vitest + Testing Library + MSW | — | Same |
| Build/run | Docker: `node:20-alpine` build → `caddy:2-alpine` runtime, port `3002` | — | Same pattern, different port |

## 3. Application Architecture

```
main.tsx (initAuth() runs and resolves BEFORE render — F-01)
└── App.tsx (static sidebar + header from GET /me — F-03)
    ├── /users           → UsersListPage        (F-10)
    ├── /users/new       → UserFormPage (create) (F-11)
    ├── /users/:id       → UserFormPage (edit)    (F-11)
    ├── /roles           → RolesListPage          (F-12)
    ├── /roles/:id       → RoleDetailPage
    │   ├── Menus tab       (F-13)
    │   └── Permissions tab (F-14)
    └── /menus           → MenusCatalogPage      (F-15)
```

### Why the sidebar is static here but driven by the API in `cce-insights-ui`'s target design

> **To be reversed by Milestone 7 (planned).** The admin sidebar will be built from `GET /me/menus?console=ADMIN`, and a link the user can't use will not be shown — replacing the decision below (F-03 and the "still sees the link and gets an inline 403" stance). This is what lets a `PROTOCOL_MANAGER` see only the Protocols tab. Until Milestone 7 ships, what follows is the current behaviour. See [cce-admin-service architecture-overview.md §9.9](../../cce-admin-service/docs/architecture-overview.md#99-planned-milestones-78--role-aware-console-and-protocol-management).

`cce-admin-service`'s `GET /me/menus` endpoint exists specifically so **other consoles**
(`cce-insights-ui`) can render a role-aware sidebar. `cce-admin-ui` itself does **not** consume it
(F-03) — its own sidebar (Users, Roles, Menus) is static. Authorization for this console is enforced
by `api_permissions` at the gateway and re-checked at the service, not by hiding nav items; a user
without permission for a screen still sees the link and gets an inline `403` (F-04), rather than the
nav silently disappearing. This is a deliberate asymmetry, not an inconsistency: menus are a feature
this service *exposes*, not one `cce-admin-ui` *consumes* — see
[cce-admin-service/docs/api-reference.md — GET /me/menus](../../cce-admin-service/docs/api-reference.md#get-memenus).

### Layer responsibilities

| Layer | Responsibility | Rule |
|---|---|---|
| `pages/` | Route-level components | Compose `hooks/` + `components/`; never call `api/` directly (F-01–F-06) |
| `components/` | Visual rendering | Stateless where possible |
| `hooks/` | TanStack Query wrappers | One hook per API endpoint group; return `{ data, isLoading, error }` |
| `api/` | Typed `fetch` wrapper (`client.ts`) + one module per resource | No React dependencies; unwraps the `{data, pagination?}` / `{error:{code,message}}` envelope into `ApiError` |
| `auth/` | `keycloak-js` init, token refresh, context | `initAuth()` blocks render (F-01) |
| `schemas/` | Zod schemas | Mirror backend validation (UPPER_SNAKE_CASE role names, email format, required fields) so a client-side error surfaces before a round trip, but server errors by `error.code` still render (milestone note) |
| `context/` | Current-user context from `GET /me` | Populates the header; sidebar does **not** depend on `/me/menus` (F-03) |

## 4. Data Flow — Mutation Lifecycle

```mermaid
sequenceDiagram
    participant Page as UserFormPage
    participant Hook as useCreateUser()
    participant API as api/users.ts
    participant AS as cce-admin-service (via gateway)

    Page->>Hook: mutate(formValues)
    Hook->>Hook: button shows pending state (F-06)
    Hook->>API: POST /admin/v1/users
    API->>AS: fetch with Bearer token
    alt 201 Created
        AS-->>API: { data: user }
        API-->>Hook: typed User
        Hook->>Hook: invalidate ['users'] query
        Hook-->>Page: success — navigate to /users
    else 409 EMAIL_IN_USE / 502 KEYCLOAK_SYNC_FAILED
        AS-->>API: { error: { code, message } }
        API-->>Hook: throws ApiError(code, message)
        Hook-->>Page: render inline by error.code (F-05)
    end
```

**No optimistic updates anywhere (F-06).** Every mutation waits for the server and invalidates the
relevant query on success rather than patching the cache client-side. Writes fan out to Keycloak and
the gateway and can fail midway (see the admin-service's
[consistency model](../../cce-admin-service/docs/architecture-overview.md#7-consistency-model)) — an
optimistic UI would show success for a request that then partially failed server-side.

### `KEYCLOAK_SYNC_FAILED` gets its own component (F-05)

A `502 KEYCLOAK_SYNC_FAILED` must never render as a generic error toast — it needs its own message
explaining what survived and the next step. What survived differs by operation, so the one shared
component (`SyncFailedNotice`, not duplicated — milestone note, F-11/F-14) has two wordings:

| `variant` | Used by | Meaning | Offers |
|---|---|---|---|
| `saved` (default) | Role Detail → Permissions tab | The edit **is** stored; only Keycloak is behind | **Re-sync** button |
| `not-saved` | User-create form | The whole creation was **rolled back**; nothing was stored | Nothing to re-sync — submit the form again |

Saying "your change was saved" after a rolled-back user creation would be false, hence the second
wording rather than reusing the first.

## 5. Error Handling

| HTTP Status | UI Behavior |
|---|---|
| `400 VALIDATION_ERROR` | Inline field errors (Zod mirrors server rules, but server errors still win by `error.code`) |
| `401 UNAUTHENTICATED` | Handled by the auth layer — token refresh or re-login, not a page-level error |
| `403 FORBIDDEN` | Shown **inline on the screen that made the call** (F-04) — never a global error page, since a role may be allowed to view a list but not a specific action on it |
| `404 USER_NOT_FOUND` / `ROLE_NOT_FOUND` / `MENU_NOT_FOUND` | "Not found" empty state on the detail page |
| `409 DUPLICATE_ROLE_NAME` / `DUPLICATE_MENU_KEY` / `EMAIL_IN_USE` / `ROLE_IN_USE` / `SYSTEM_ROLE_IMMUTABLE` | Inline, next to the field or action that caused it |
| `502 KEYCLOAK_SYNC_FAILED` | Distinct component (§4) — never a generic toast |

## 6. State Management

| State type | Tool | Examples |
|---|---|---|
| Server state | TanStack Query | Users, roles, menus, permissions — all server-owned, no client mutation of cached data |
| Form state | React Hook Form + Zod | Create/edit forms |
| Current user | Context, from `GET /me` | Header display only — does **not** drive sidebar visibility (§3). Header states: loading; signed in as `username (ROLE, …)` or `(no roles)`; `403` → "Your account has no access to the admin console" (Keycloak login worked, but there is no local `ACTIVE` user); any other error → "Could not load your profile" |
| UI state | `useState` | Active tab (Menus/Permissions), selected rows |

### Query key strategy

```typescript
['users', { status, roleId, facilityScope, q, page, pageSize }]
['users', userId]
['roles']
['roles', roleId]
['roles', roleId, 'menus']
['roles', roleId, 'permissions']
['menus']
['me']
```

A role's Menus and Permissions tabs are **separate query keys** (not one combined "role detail"
fetch) — the two axes are independently editable and independently saved
([cce-admin-service architecture §2](../../cce-admin-service/docs/architecture-overview.md#2-why-two-independent-axes)),
so their caches should invalidate independently too.

## 7. Routing

```tsx
<Routes>
  <Route path="/users" element={<UsersListPage />} />
  <Route path="/users/new" element={<UserFormPage mode="create" />} />
  <Route path="/users/:id" element={<UserFormPage mode="edit" />} />
  <Route path="/roles" element={<RolesListPage />} />
  <Route path="/roles/:id" element={<RoleDetailPage />} />
  <Route path="/menus" element={<MenusCatalogPage />} />
</Routes>
```

Sidebar (static, F-03): **Users**, **Roles**, **Menus** — three links, always rendered the same for
every signed-in user regardless of role. What a user can actually *do* on each screen is governed by
`api_permissions`, surfaced as inline `403`s, not by hiding the link.

## 8. Deployment

Docker build-time `VITE_*` args (same pattern as `cce-insights-ui`) — see
[deployment-guide.md](deployment-guide.md). Each environment needs its own image build.
