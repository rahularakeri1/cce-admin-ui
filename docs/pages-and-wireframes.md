# Pages & Wireframes — Admin UI

Textual wireframes for the six screens in F-10…F-15 of `CCE_Admin_Module_PRD.pdf`. No visual mockups
exist yet — these are structural descriptions to build against, not pixel specs. Flag anything that
needs an actual design pass rather than guessing at layout.

---

## `/users` — Users List (F-10)

```
┌─ Users ──────────────────────────────────────────────── [+ New User] ─┐
│ [Search...] [Status ▾] [Role ▾] [Facility ▾]                          │
├─────────────────────────────────────────────────────────────────────┤
│ Username   Email            Status    Roles         Facility  Last   │
│                                                                Login  │
│ jdoe       jdoe@moh.rw       ACTIVE    FACILITY_ADMIN  Kigali  2d ago │
│ asmith  ⚠ asmith@moh.rw      ACTIVE    FACILITY_ADMIN  Huye    —      │
│ ...                                                [view][edit][⋯]   │
├─────────────────────────────────────────────────────────────────────┤
│                                              ◂ 1 2 3 … ▸  20/page ▾  │
└─────────────────────────────────────────────────────────────────────┘
```

- **Milestone 5 ships the list, filters, pagination and the "needs attention" flag.** The row actions
  below (view / edit / activate / reset password) arrive with Milestone 6, so rows have no actions yet.
- Filters (`status`, `role`, `facility`, `q`) map directly to `GET /users` query params — server-side,
  not client-filtered. They are applied with an **Apply** button (and cleared with **Reset**), not live
  on every keystroke, so typing a search doesn't fire a request per character. `q` matches name,
  username or email, case-insensitively.
- Row actions: **view** (→ `/users/:id`), **edit** (→ `/users/:id`), **activate/deactivate**
  (`PATCH /users/:id/status`, confirm dialog), **reset password**
  (`POST /users/:id/reset-password`, confirm dialog — "an email will be sent, no password shown
  here").
- **"Needs attention" indicator** (the `⚠ asmith` row above): shown for any row where
  `status = ACTIVE` and `last_login_at` is empty — this user was created but has never completed
  verify-email/set-password, so they still can't log in. Purely a derived client-side flag from two
  columns already in the response, not a new field or endpoint. Clicking it (or the row's reset
  action) resends the same invite email — same `POST /users/:id/reset-password` call every other row
  has, just surfaced more prominently here since it's actionable rather than routine
  ([cce-admin-service api-reference.md § reset-password](../../cce-admin-service/docs/api-reference.md)).
  A row with `last_login_at` populated — even if stale/old — never shows this; that's a distinct
  "dormant account" concern, not this indicator.
- Pagination is server-side (the `pagination` envelope block): fixed page size 20 with **Previous / Next**
  and a "Showing 21–25 of 25" range — no page-size dropdown or page numbers yet. The previous page's
  rows stay on screen while the next one loads. Newest users first.

## `/users/new`, `/users/:id` — User Create/Edit (F-11) — create ships in Milestone 5, edit in Milestone 6

```
┌─ New User ───────────────────────────────────────┐
│ Username *      [___________]                    │
│ Email *         [___________]                    │
│ First name *    [___________]                    │
│ Last name *     [___________]                    │
│ Facility scope  [___________]  (free text — not  │
│                                  validated against│
│                                  a facility list   │
│                                  this release)     │
│ Roles *         [ ] FACILITY_ADMIN                │
│                 [ ] SUPER_ADMIN                   │
│                                                    │
│              [Cancel]   [Create User →]           │
└───────────────────────────────────────────────────┘
```

- **Server outcomes land on the field they're about**, even when client-side validation passed:
  `409 EMAIL_IN_USE` on Email, `409 USERNAME_IN_USE` on Username, `409 ROLE_NOT_SYNCED` under Roles
  ("Role(s) not in Keycloak yet: X — open the role's Permissions tab and Save or Re-sync first").
  `502 KEYCLOAK_SYNC_FAILED` shows the shared `SyncFailedNotice` in its **"nothing was saved"** wording
  (the whole creation was rolled back, so there is no Re-sync — just submit again; what was typed is kept).
- Roles may be left empty (the server allows a user with no roles); the wireframe's `*` is not enforced.
- **Create posts once** — no separate "sync" step shown to the user; `POST /users` does Keycloak
  provisioning, role assignment, the local insert, and triggers the invite email automatically,
  server-side, in one call (F-11). The submit button shows a pending state (no optimistic nav) until
  the `201` or an error returns.
- **After `201`** the page is replaced by a "User created" confirmation (name, email, roles, "invitation
  email sent — link valid 72 hours") with **Back to users** and **Create another**. There is no user
  detail page to navigate to until Milestone 6.
- **`201` with a `warnings` entry** (the invite email failed to send, but the user was created
  successfully) — the same confirmation, plus an amber banner with the warning text, not a blocking
  error. The "needs attention" indicator on the Users list
  catches this too if the banner is missed, so this isn't the only safety net.
- **Edit** is three separate actions sharing one page, not one combined "save": `PUT /users/:id`
  (profile fields), `PUT /users/:id/roles` (full replacement set), `PATCH /users/:id/status`
  (activate/deactivate), `POST /users/:id/reset-password` — each its own button, each its own pending
  state and error surface (F-11). Don't collapse these into a single "Save" that calls four
  endpoints silently; a partial failure (e.g. roles saved, status patch failed) needs to be visible
  per-action.
- A `502 KEYCLOAK_SYNC_FAILED` on create shows the shared sync-failure component
  (architecture-overview.md §4), not a generic toast — and does **not** clear the form, so the admin
  doesn't lose their input while deciding whether to retry.

## `/roles` — Roles List (F-12)

```
┌─ Roles ────────────────────────────────────── [+ New Role] ─────────┐
│ Name              Display Name            System?                   │
│ 🔒 SUPER_ADMIN     Super Administrator      🔒 locked                │
│    FACILITY_ADMIN  Facility Administrator                  [view]   │
├─ + New Role (inline form) ───────────────────────────────────────────┤
│ Name *  [UPPER_SNAKE_CASE___]  ⚠ "Name is permanent — cannot be      │
│                                   renamed after creation"            │
│ Display name * [___________]                                        │
│ Description     [___________]                                       │
└───────────────────────────────────────────────────────────────────┘
```

- Each non-system row has a **view** link and a **Delete** button; Delete asks for an explicit
  "Delete NAME? [Confirm delete] [Cancel]" in the row (no optimistic removal — the row disappears on
  the next real refetch). `409 ROLE_IN_USE` shows inline in that row ("users still hold this role").
- `is_system` roles (`SUPER_ADMIN`) show a lock icon; their row has only **view** — no delete/rename
  action, not just a disabled one — the UI shouldn't let an admin discover `409 SYSTEM_ROLE_IMMUTABLE` by clicking
  something that visibly can't work.
- A name that already exists as a gateway permission set (e.g. `COMPLIANCE_READ`) is refused by the server
  with `409 ROLE_NAME_RESERVED`, shown inline on the name field.
- Client-side Zod validates `UPPER_SNAKE_CASE` on the name field before submit, but the server is
  still the authority — a `409 DUPLICATE_ROLE_NAME` renders inline even if the client-side check
  passed (two admins racing to create the same name).

## `/roles/:id` — Role Detail (F-13, F-14)

```
┌─ Facility Administrator (FACILITY_ADMIN) ─────────────────────────┐
│ [ Menus ]  [ Permissions ]                                        │
├────────────────────────────────────────────────────────────────────┤
│ Menus tab:                                                        │
│  ☑ Dashboard                                                      │
│  ☑ Compliance                                                      │
│  ☐ Ingestion                                                       │
│                                           [Save] (disabled: no Δ) │
├────────────────────────────────────────────────────────────────────┤
│ Permissions tab:                                                   │
│  Method  URI Pattern                  Category     Description    │
│  GET     /v1/insights/compliance/**   COMPLIANCE   ...    [edit]  │
│  [+ Add permission row]                                           │
│  Status: ✓ synced          [Save]  [Re-sync]                      │
└────────────────────────────────────────────────────────────────────┘
```

- The menu checklist lists the whole catalog, flagging inactive menus, and is editable on system roles
  too.
- **Two independent tabs, two independent saves** — this is the UI expression of the "two axes"
  design in the backend (menus = soft/cosmetic control, permissions = hard/security control). Saving
  Menus never touches Permissions and vice versa.
- Menus tab: flat checkbox list from `GET /menus`, current selection from `GET /roles/:id/menus`
  (simplified from the PRD's NAV/DETAIL tree — see
  [cce-admin-service data dictionary §1.3](../../cce-admin-service/docs/data-dictionary.md#13-menus--console-screen-catalog)).
- **Save is disabled until the set actually changes** — diffed against the last-fetched state, not a
  dirty flag on individual checkboxes (F-13/F-14 milestone note). The payload sent on save is always
  the **complete** set, never a partial diff.
- Permissions tab (`/roles/:id/permissions`): editable rows — method (GET/POST/PUT/PATCH/DELETE select),
  URI pattern (must start with `/`, no spaces), category, description — with add/remove. Client-side
  validation (pattern, duplicate method+pattern) shows next to the row and sends nothing. Save is disabled
  until the rows differ from what was fetched and always sends the **complete** set. A **system role**
  (e.g. `SUPER_ADMIN`) shows its rows read-only with a lock note — no inputs, Add or Save. `409 ROLE_IN_USE`
  (emptying a role users still hold) shows inline.
- The sync status line reflects only the last Save/Re-sync **in this browser session** — nothing is stored,
  and gateway can't say whether a role exists in Keycloak:
  **✓ Synced** (last Save/Re-sync succeeded) · **Sync failed** (the shared notice + Re-sync button; the rows
  *are* saved, the tab reloads them from the server) · **Sync status unknown** on first load, with a
  Re-sync link.
- The failed state is the shared `SyncFailedNotice` (architecture-overview.md §4) with a manual **Re-sync**
  button (`POST /roles/:id/sync`) — the same component the create-user flow reuses (F-05).

## `/menus` — Menus Catalog (F-15)

```
┌─ Menus ────────────────────────────────────────── [+ Add Menu] ─────┐
│   Dashboard                /                            [edit][✕]   │
│   Facilities               /facilities                  [edit][✕]   │
│   Compliance                /compliance                 [edit][✕]   │
│   Patients                  /compliance/patients         [edit][✕]  │
└───────────────────────────────────────────────────────────────────┘
```

- Flat table, ordered by `sort_order` (simplified from the PRD's NAV/DETAIL tree — see
  [cce-admin-service data dictionary §1.3](../../cce-admin-service/docs/data-dictionary.md#13-menus--console-screen-catalog)).
  Add/edit form: `menuKey`, `label`, `path`, `icon`, `sortOrder`, `isActive`.
- "Deactivate" (toggle `isActive`) rather than delete is the primary action for retiring a menu — a
  hard delete also removes the menu's `role_menus` rows (every role that had it loses the assignment
  silently), so the delete action should carry a confirm dialog naming that consequence.

---

## Cross-cutting notes

- Every list/detail screen above shows a **403 inline, on the screen that made the call** (F-04) —
  not a global "access denied" page — since a role might see `/roles` in the nav (it's a static
  sidebar, architecture-overview.md §7) but lack the permission for a specific action on it.
- No screen in this console implements optimistic UI (F-06, PRD §2 Out of scope) — every button shows
  a pending state and waits for the server.
