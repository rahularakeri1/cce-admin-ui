import { http, HttpResponse } from "msw";

const BASE = "*/admin/v1";

// Mirrors cce-admin-service/docs/api-reference.md's JSON examples. A toggleable flag lets tests
// force the KEYCLOAK_SYNC_FAILED / warnings paths without a real backend (U4).
export const syncState = { permissionsSyncShouldFail: false, createUserEmailShouldFail: false };

const menus = [
  { id: "m-1", label: "Dashboard", path: "/", icon: "ChartBarIcon" },
  { id: "m-2", label: "Facilities", path: "/facilities", icon: "BuildingOffice2Icon" },
  { id: "m-3", label: "Compliance", path: "/compliance", icon: "ClipboardDocumentCheckIcon" },
];

const roles = [{ id: "r-1", name: "SUPER_ADMIN", displayName: "Super Administrator", isSystem: true }];

const users = [
  {
    id: "u-1",
    username: "jdoe",
    email: "jdoe@moh.rw",
    status: "ACTIVE",
    roles: ["SUPER_ADMIN"],
    facilityScope: null,
    lastLoginAt: null,
  },
];

export const handlers = [
  http.get(`${BASE}/me`, () =>
    HttpResponse.json({
      data: { id: "u-1", username: "jdoe", roles: ["SUPER_ADMIN"], facilityScope: null },
    }),
  ),

  http.get(`${BASE}/me/menus`, () => HttpResponse.json({ data: menus })),

  http.get(`${BASE}/users`, () =>
    HttpResponse.json({ data: users, pagination: { page: 0, pageSize: 20, total: users.length } }),
  ),

  http.post(`${BASE}/users`, async ({ request }) => {
    const body = (await request.json()) as { email: string };
    if (users.some((u) => u.email === body.email)) {
      return HttpResponse.json({ error: { code: "EMAIL_IN_USE", message: "Email already in use" } }, { status: 409 });
    }
    if (syncState.createUserEmailShouldFail) {
      return HttpResponse.json(
        { data: { id: "u-2", ...body, status: "ACTIVE" }, warnings: ["Invitation email could not be sent — use Reset Password to resend"] },
        { status: 201 },
      );
    }
    return HttpResponse.json({ data: { id: "u-2", ...body, status: "ACTIVE" } }, { status: 201 });
  }),

  http.get(`${BASE}/roles`, () => HttpResponse.json({ data: roles })),

  http.post(`${BASE}/roles`, async ({ request }) => {
    const body = (await request.json()) as { name: string };
    if (roles.some((r) => r.name === body.name)) {
      return HttpResponse.json(
        { error: { code: "DUPLICATE_ROLE_NAME", message: "Role name already in use" } },
        { status: 409 },
      );
    }
    return HttpResponse.json({ data: { id: "r-2", ...body, isSystem: false } }, { status: 201 });
  }),

  http.get(`${BASE}/roles/:id/menus`, () => HttpResponse.json({ data: { menuIds: ["m-1"] } })),
  http.put(`${BASE}/roles/:id/menus`, () => HttpResponse.json({ data: { menuIds: ["m-1", "m-2"] } })),

  http.get(`${BASE}/roles/:id/permissions`, () => HttpResponse.json({ data: { permissions: [] } })),
  http.put(`${BASE}/roles/:id/permissions`, async ({ request }) => {
    const body = await request.json();
    if (syncState.permissionsSyncShouldFail) {
      return HttpResponse.json(
        { error: { code: "KEYCLOAK_SYNC_FAILED", message: "Sync to Keycloak failed" } },
        { status: 502 },
      );
    }
    return HttpResponse.json({ data: body });
  }),

  http.post(`${BASE}/roles/:id/sync`, () => {
    if (syncState.permissionsSyncShouldFail) {
      return HttpResponse.json(
        { error: { code: "KEYCLOAK_SYNC_FAILED", message: "Sync to Keycloak failed" } },
        { status: 502 },
      );
    }
    return HttpResponse.json({ data: {} });
  }),

  http.get(`${BASE}/menus`, () => HttpResponse.json({ data: menus })),

  http.get(`${BASE}/health`, () => HttpResponse.json({ status: "UP" })),
];
