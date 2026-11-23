import { http, HttpResponse } from "msw";

const BASE = "*/admin/v1";

// Mirrors cce-admin-service/docs/api-reference.md's JSON examples. A toggleable flag lets tests
// force the KEYCLOAK_SYNC_FAILED / warnings paths without a real backend (U4).
export const syncState = { permissionsSyncShouldFail: false, createUserEmailShouldFail: false };

const seedMenus = () => [
  { id: "m-1", menuKey: "dashboard", label: "Dashboard", path: "/", icon: "ChartBarIcon", sortOrder: 1, isActive: true },
  { id: "m-2", menuKey: "facilities", label: "Facilities", path: "/facilities", icon: "BuildingOffice2Icon", sortOrder: 2, isActive: true },
  { id: "m-3", menuKey: "compliance", label: "Compliance", path: "/compliance", icon: "ClipboardDocumentCheckIcon", sortOrder: 3, isActive: true },
];

const seedRoles = () => [
  {
    id: "r-1",
    name: "SUPER_ADMIN",
    displayName: "Super Administrator",
    description: null as string | null,
    isSystem: true,
    createdAt: "2026-11-23T00:00:00Z",
    updatedAt: "2026-11-23T00:00:00Z",
  },
];

// Stateful in-memory stand-in for the backend's roles/menus, so create -> list -> delete flows can be
// tested. test-setup.ts calls resetMockDb() after every test. Request bodies are recorded so tests
// can assert exactly what the UI sent (e.g. the COMPLETE menuIds set).
export const mockDb = {
  menus: seedMenus(),
  roles: seedRoles(),
  roleMenus: {} as Record<string, string[]>,
  rolesInUse: new Set<string>(),
  lastMenusPut: null as { roleId: string; body: { menuIds: string[] } } | null,
  nextRoleId: 2,
};

export function resetMockDb() {
  mockDb.menus = seedMenus();
  mockDb.roles = seedRoles();
  mockDb.roleMenus = {};
  mockDb.rolesInUse = new Set();
  mockDb.lastMenusPut = null;
  mockDb.nextRoleId = 2;
}

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

  http.get(`${BASE}/me/menus`, () => HttpResponse.json({ data: mockDb.menus })),

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

  http.get(`${BASE}/roles`, () => HttpResponse.json({ data: mockDb.roles })),

  http.post(`${BASE}/roles`, async ({ request }) => {
    const body = (await request.json()) as { name: string; displayName: string; description?: string };
    if (mockDb.roles.some((r) => r.name === body.name)) {
      return HttpResponse.json(
        { error: { code: "DUPLICATE_ROLE_NAME", message: "Role name already in use" } },
        { status: 409 },
      );
    }
    const role = {
      id: `r-${mockDb.nextRoleId++}`,
      name: body.name,
      displayName: body.displayName,
      description: body.description ?? null,
      isSystem: false,
      createdAt: "2026-11-23T00:00:00Z",
      updatedAt: "2026-11-23T00:00:00Z",
    };
    mockDb.roles.push(role);
    return HttpResponse.json({ data: role }, { status: 201 });
  }),

  http.get(`${BASE}/roles/:id`, ({ params }) => {
    const role = mockDb.roles.find((r) => r.id === params.id);
    if (!role) {
      return HttpResponse.json({ error: { code: "ROLE_NOT_FOUND", message: "No such role" } }, { status: 404 });
    }
    return HttpResponse.json({ data: role });
  }),

  http.delete(`${BASE}/roles/:id`, ({ params }) => {
    const role = mockDb.roles.find((r) => r.id === params.id);
    if (!role) {
      return HttpResponse.json({ error: { code: "ROLE_NOT_FOUND", message: "No such role" } }, { status: 404 });
    }
    if (role.isSystem) {
      return HttpResponse.json(
        { error: { code: "SYSTEM_ROLE_IMMUTABLE", message: "System role cannot be deleted" } },
        { status: 409 },
      );
    }
    if (mockDb.rolesInUse.has(role.id)) {
      return HttpResponse.json({ error: { code: "ROLE_IN_USE", message: "Role is still assigned" } }, { status: 409 });
    }
    mockDb.roles = mockDb.roles.filter((r) => r.id !== role.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/roles/:id/menus`, ({ params }) =>
    HttpResponse.json({ data: { menuIds: mockDb.roleMenus[params.id as string] ?? [] } }),
  ),
  http.put(`${BASE}/roles/:id/menus`, async ({ params, request }) => {
    const body = (await request.json()) as { menuIds: string[] };
    mockDb.lastMenusPut = { roleId: params.id as string, body };
    mockDb.roleMenus[params.id as string] = [...body.menuIds];
    return HttpResponse.json({ data: { menuIds: body.menuIds } });
  }),

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

  http.get(`${BASE}/menus`, () => HttpResponse.json({ data: mockDb.menus })),

  http.get(`${BASE}/health`, () => HttpResponse.json({ status: "UP" })),
];
