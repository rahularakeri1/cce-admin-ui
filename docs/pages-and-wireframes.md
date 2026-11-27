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

- The menu checklist lists the whole catalog grouped under **Insights** and **Admin console**, flagging inactive
  menus, and is editable on system roles too — except that the admin tabs follow the rules described under
  "Role-aware sidebar" below (greyed out / locked).
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

## `/menus` — Menus Catalog (F-15, Milestone 9)

> **Planned — docs first, not implemented yet.** The text below describes the target for these parts, which arrive in their own PRs; until each one merges, the screen does not have it:
> - arranging by dragging, and no sort-number field (Milestone 9b)
> - icons in the sidebar and the Menus table (Milestone 9c)
> - the icon picker in the form (Milestone 9d)

Manages the **catalog itself** — the list of sidebar entries and their order — not which roles get which entry (that is
the role's own Menus tab). `SUPER_ADMIN` only: the tab is greyed out for every other role and the service refuses the
calls.

```
┌─ Menus ──────────────────────────────────────────────────── [+ Add menu] ───────────────┐
│ ● Order changed — not saved yet                              [Save order]  [Reset]       │
│  #   Label           Key         Path        Status                                       │
│ INSIGHTS                                                                                  │
│  ⋮⋮ 1  Dashboard     dashboard   /           Active    [▲][▼] [Edit][Deactivate][Delete]  │
│  ⋮⋮ 2  Events        events      /events     Inactive  [▲][▼] [Edit][Activate][Delete]    │
│ ADMIN CONSOLE                                                                             │
│  ⋮⋮ 1  Users 🔒      admin-users /users      Active    [▲][▼] [Edit] (Deactivate, Delete off) │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Table**, grouped *Insights* then *Admin console*: position, **icon and label** (struck through when inactive), key, path,
  status. The icon is the one saved on the entry, drawn from the same Heroicons names `cce-insights-ui` uses; an entry with
  none shows a blank, and a name this console can't draw shows an amber **?** with the name in its tooltip, so a typo is
  visible. An action on one row (a refused deactivate) shows its message under that row.
- **Arranging.** Drag a row by its ⋮⋮ handle to where it should go — within its own group; a drop onto the other group
  is ignored. The ▲ / ▼ buttons on every row do the same one step at a time, for keyboards and touch screens (▲ is off on
  the first row of a group, ▼ on the last). The new order shows at once as a **draft**: a bar appears with **Save order**
  and **Reset**. Nothing is stored until **Save order**, which sends the complete order of each changed group in one call
  per group (`PUT /menus/order`) and then re-reads the list; **Reset** drops the draft. There are no sort numbers to type
  anywhere: the numbers shown are just positions. The admin console's own tabs can be arranged too — that changes the
  order of this console's sidebar, which updates when saved.
- **If the list changed meanwhile** (another admin added or deleted an entry while you were arranging), the save is
  refused (`409 MENU_ORDER_OUTDATED`): the screen says the list changed, reloads it and drops the draft, so you arrange
  again against the current list. An entry deleted while you have a draft simply drops out of it; one added appears at
  the end of its group.
- **+ Add menu** (`/menus/new`) and **Edit** (`/menus/:id`) share one form: key, label, path, icon, active. The **icon**
  field shows a **live preview** and has a **Browse icons** button that opens a **picker**: a grid of every icon this
  console can draw — shown as pictures, each with its name under it — so nobody needs to know the names. Click one to
  choose it (the field and preview fill in and the picker closes); **None** clears it; a search box above the grid filters by
  name ("chart", "user"). The chosen icon is highlighted. Arrow keys move around the grid, **Enter** chooses, **Esc** closes.
  The set is a curated 65 common Heroicons (the ten already in use plus the rest). Typing a name is still allowed, with
  suggestions as you type; a name outside the set still saves — other consoles may know more icons — but is flagged
  ("this console can't draw it") and, if it differs from a known name only by case, the fix is offered ("Did you mean
  ChartBarIcon?"). An entry that already holds a name outside the set shows it in the picker as the current value. The **key is
  permanent** — read-only when editing, with the reason. **Console** is shown but not editable: entries made here are
  always *Insights*; the admin console's own tabs come from a migration (an admin tab needs a screen built in code). A new
  entry goes to the **end of Insights**, and the form says so — drag it into place afterwards. Checked in the browser first
  (key lower-case letters/digits/`-`/`_`, path starts with `/`); a duplicate key (`409`) is explained next to the key field
  and nothing typed is lost. Saving returns to the table with a message and the saved row highlighted; adding says
  *"Added … at the end of Insights. Drag it into place, then assign it to roles on the Roles screen."*
- **Deactivate / Activate** is the usual way to retire an entry: it disappears from **every** sidebar but keeps its
  role assignments, and activating brings it back for the same roles.
- **Delete** is the drastic one and asks first, in a dialog that names the real consequence — *"This also removes it from
  every role that has it. Those roles lose it silently, and it can't be undone"* — and points to Deactivate. Cancel and
  Escape change nothing. (The dialog does not list the affected roles; that would need an API addition.)
- **The four admin tabs are protected** (a 🔒 on the label): their Deactivate and Delete are disabled with the reason,
  and on Edit their key and path are read-only and *Active* is locked on — otherwise the console could be locked
  out from its own catalog screen. Label and position stay editable. The server refuses the same things (`409
  ADMIN_MENU_PROTECTED`), so calling the API directly doesn't get round it.
- Any change refetches the catalog, every role's saved menus and **this console's own sidebar**, so renaming or
  re-arranging an admin tab shows in the sidebar at once.
- **Where the icon is used.** From Milestone 9c this console draws it (sidebar, table, form). `cce-insights-ui` does **not** yet: its
  sidebar is a fixed list with its own icons and never reads `GET /me/menus`, so an icon saved here has no effect there
  until that UI is changed to fetch the menu list (not in the current plan).
- Flat table, simplified from the PRD's NAV/DETAIL tree — see
  [cce-admin-service data dictionary §1.3](../../cce-admin-service/docs/data-dictionary.md#13-menus--console-screen-catalog).

---

## Cross-cutting notes

- Every list/detail screen above shows a **403 inline, on the screen that made the call** (F-04) —
  not a global "access denied" page — since a role might see the Roles tab in the sidebar but lack the
  permission for a specific action on it.
- No screen in this console implements optimistic UI (F-06, PRD §2 Out of scope) — every button shows
  a pending state and waits for the server.

---

## Role-aware sidebar (Milestone 7)

- **Sidebar from the API.** Built from `GET /me/menus?console=ADMIN`, in position order, as links with each entry's icon and label:
  **Users**, **Roles**, **Menus**, **Protocols** for a `SUPER_ADMIN`; only the entries a user's roles carry for
  anyone else. This replaced the static three-link sidebar (F-03). A tab the API returns that this build has no
  screen for is not shown. *(Planned, Milestone 9c)* **Icons:** each link shows the icon saved on its menu entry (a Heroicons outline name, e.g.
  `UsersIcon`) before its label. An entry with no icon, or a name this console can't draw, shows no icon there (the label
  is still aligned), and the link's accessible name is just its label.
- **Landing.** After sign-in a user lands on their first allowed tab.
- **Route guards.** A URL the user has no tab for redirects to their first allowed tab. A user with no admin tabs
  at all — or whose menus call answers `403` — sees a plain "No access to the admin console" screen (with its
  own Sign out button).
- **Menu call fails.** The main area shows an error with a **Retry** (which reloads the profile in the header too)
  and the sidebar stays empty — never a flash of the wrong sidebar. The menus are also re-checked when the browser tab regains focus, so a tab another admin
  just added or removed shows up without a manual reload.
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
  enforces both rules (`409`, shown inline if it ever refuses a save); the greying-out just avoids offering what
  would be refused. A locked tab is always sent ticked, even when only an insights menu changed.
- `/protocols` is a placeholder until Milestone 8.

## `/protocols` — Protocols (Milestone 8)

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
- **Detail** (`/protocols/:id`): url, version, status, loaded-at and canonical, the stored definition as read-only
  formatted JSON with a Copy button (it says so if the browser refuses), plus **Retire**. Retire asks first, in
  place: *it stops matching new events straight away; patients already enrolled are not affected; it can't be
  undone from this console.* A retired protocol shows RETIRED (from a real refetch) and offers no Retire. No delete
  in v1.
- **Upload** (`/protocols/new`): pick a `.json` file or paste (a file over 5 MB is refused unread). Checked **in the browser before anything is sent**: valid JSON,
  `resourceType` is `PlanDefinition`, `url` and `version` present. A **preview** shows url, version and the
  number of actions; **Upload** sends `{ "planDefinitionJson": "<the resource as a string>" }`. The protocol
  service's own validation *warnings* are only logged by it, so the preview can't show them.
- **Server outcomes inline:** decided by HTTP status. A `400`/`422` rejection shows the protocol service's own
  reason; the same `(url, version)` twice — which the service answers with **`400`**, not `409` — is explained
  ("this version is already loaded — change the version in the file, or retire the old one"); **any `5xx` or a
  network failure** shows "Protocol service unavailable — nothing was uploaded / changed" (with a Retry on the
  list and detail), because the gateway answers a down protocol service with a bare `500`, not `502`/`503`;
  a `403` with the gateway's JSON body shows "your role isn't allowed to do this", but an **empty** `403` — the
  gateway's CORS refusal, which hits upload and retire while list and detail still work — says the gateway blocked
  the request and the console's address is probably missing from its allowed origins, so it is not blamed on the role. After a successful upload the list shows
  "Uploaded <url> <version>". No optimistic UI: the list refetches after an upload or retire.
- **Who sees and who may use it.** The **Protocols tab** appears for a role that has it ticked; the **calls** work
  only if the role also has gateway permission rows for them. `SUPER_ADMIN` has both. Any other role needs a
  `SUPER_ADMIN` to tick the tab and add four rows on its Permissions tab (`GET /admin/v1/me`,
  `GET /admin/v1/me/menus`, `GET` and `POST /v1/protocol/protocol-definitions/**`) — see
  [cce-admin-service architecture-overview.md §9.9](../../cce-admin-service/docs/architecture-overview.md#99-milestones-78--role-aware-console-and-protocol-management).
- Who uploaded or retired what is **not recorded** in this release (an open question — §9.10 there).
