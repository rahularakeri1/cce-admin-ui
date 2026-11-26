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

- **Row actions are deliberately light.** The name links to the detail page (`/users/:id`), where every action
  lives. The one thing surfaced on the list is **Resend invite** on a "needs attention" row (same
  `POST /users/:id/reset-password` as the detail page; shows "Invitation sent" or the error inline).
  Activate/deactivate and role changes are *not* on the list — they need the detail page's room for confirms
  and errors. The wireframe's `[view][edit][⋯]` column is therefore just the name link.
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
- **Detail page (Milestone 6)** — `/users/:id` shows the user's name, username, email, status and last login, then
  four independent sections, each a `<section>` with its own button, pending state and error surface:
  **Profile** (first/last name, email, facility; username shown as permanent; Save disabled until changed; a hint
  appears while the email is being changed — it is marked unverified, they must sign in again), **Roles**
  (checklist, sends the complete set, Save disabled until the set changes), **Status** (Deactivate/Reactivate
  with an explicit in-place confirm; **no Deactivate button on your own account**), **Password & invitation**
  ("Resend invitation" for a never-signed-in user, "Send password reset email" otherwise; confirm first; unavailable
  with the reason for an inactive user). Server refusals appear in the section they belong to —
  `LAST_SUPER_ADMIN`, `ROLE_NOT_SYNCED`, `EMAIL_IN_USE` — and a `502` shows the shared "nothing was saved" notice
  with the entered values kept.
- **System accounts are read-only.** For a user with `isSystem` (the bootstrap admin) the detail page shows a
  "System account" note, a **System** badge (also on the Users list), read-only profile fields, disabled role
  checkboxes and no Save buttons, and the Status section says system accounts can't be deactivated. Only
  **Password & invitation** stays active (reset is the recovery path). The server enforces the same rule
  (`409 SYSTEM_USER_IMMUTABLE`); the UI just doesn't offer what would be refused.
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

---

## Planned — role-aware sidebar (Milestone 7)

> **Planned — Milestone 7. Not implemented yet;** this is the agreed design, written first (docs-first).

- **Sidebar from the API.** Built from `GET /me/menus?console=ADMIN`, in `sort_order`, as plain text links:
  **Users**, **Roles**, **Menus**, **Protocols** for a `SUPER_ADMIN`; only the entries a user's roles carry for
  anyone else. This replaces the static three-link sidebar (F-03).
- **Landing.** After sign-in a user lands on their first allowed tab.
- **Route guards.** A URL the user has no tab for redirects to their first allowed tab. A user with no admin tabs
  at all sees a plain "You don't have access to any part of the admin console" screen (still with Sign out).
- **Menu call fails.** The sidebar area shows an error with a **Retry** — never a flash of the wrong sidebar.
- A link a user can't use is not shown; the server still refuses the call, so hiding is convenience, not security.
- **Role Detail → Menus tab** groups the catalog under **Insights** and **Admin console**:

```
Admin console
  ☐ Users      (greyed — SUPER_ADMIN only)      for every role except SUPER_ADMIN
  ☐ Roles      (greyed — SUPER_ADMIN only)
  ☐ Menus      (greyed — SUPER_ADMIN only)
  ☐ Protocols                                   can be ticked for any role
Insights
  ☑ Dashboard  ☑ Facilities  ☐ Compliance ...
```

  On the **`SUPER_ADMIN`** role all four admin entries are ticked and **locked** (cannot be removed). The server
  enforces both rules (`409`); the greying-out just avoids offering what would be refused.
- `/protocols` is a placeholder until Milestone 8.

## `/protocols` — Protocols (planned — Milestone 8)

> **Planned — Milestone 8. Not implemented yet;** this is the agreed design, written first (docs-first).

```
┌─ Protocols ─────────────────────────────────────────── [+ Upload protocol] ─┐
│ URL                                         Version  Status    Loaded at     │
│ http://openphc.org/fhir/PlanDefinition/anc  1.0.0    ACTIVE    2026-11-25    │
│ http://openphc.org/fhir/PlanDefinition/emr  2.1.0    RETIRED   2026-10-02    │
│                                                         ◂ 1 2 ▸  20/page    │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Calls the protocol service through the gateway**, directly, with the user's token:
  `/v1/protocol/protocol-definitions` — there is no admin-service endpoint in between. In development the dev
  server forwards `/v1/protocol` to the gateway (port 8090), which routes to the protocol service (8091).
- **List:** URL, version, status, loaded-at; server-paged (`page`, `size`, `sort`), newest first. Each row links
  to the detail view.
- **Detail:** the stored definition as read-only formatted JSON with a Copy button, plus **Retire** (explicit
  in-place confirm — a retired protocol stops being matched). No delete in v1.
- **Upload:** pick a `.json` file or paste. Checked **in the browser before anything is sent**: valid JSON,
  `resourceType` is `PlanDefinition`, `url` and `version` present. A **preview** shows url, version and the
  number of actions; **Upload** sends `{ "planDefinitionJson": "<the resource as a string>" }`. The protocol
  service's own validation *warnings* are only logged by it, so the preview can't show them.
- **Server outcomes inline:** a rejection shows the protocol service's own reason; the same `(url, version)`
  twice is explained ("this version is already loaded — change the version or retire the old one");
  a down protocol service shows "protocol service unavailable — nothing was uploaded"; a `403` shows
  "your role isn't allowed to do this". No optimistic UI: the list refetches after an upload or retire.
- **Who sees and who may use it.** The **Protocols tab** appears for a role that has it ticked; the **calls** work
  only if the role also has gateway permission rows for them. `SUPER_ADMIN` has both. Any other role needs a
  `SUPER_ADMIN` to tick the tab and add four rows on its Permissions tab (`GET /admin/v1/me`,
  `GET /admin/v1/me/menus`, `GET` and `POST /v1/protocol/protocol-definitions/**`) — see
  [cce-admin-service architecture-overview.md §9.9](../../cce-admin-service/docs/architecture-overview.md#99-planned-milestones-78--role-aware-console-and-protocol-management).
- Who uploaded or retired what is **not recorded** in this release (an open question — §9.10 there).
