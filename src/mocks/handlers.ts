import { http, HttpResponse } from "msw";

const BASE = "*/admin/v1";

// Mirrors cce-admin-service/docs/api-reference.md's JSON examples. A toggleable flag lets tests
// force the KEYCLOAK_SYNC_FAILED / warnings paths without a real backend (U4).
export const syncState = {
  permissionsSyncShouldFail: false,
  createUserEmailShouldFail: false, // invite email fails -> 201 + warnings
  createUserKeycloakShouldFail: false, // Keycloak down -> 502, nothing saved
};

interface MockPermission {
  id?: number;
  httpMethod: string;
  uriPattern: string;
  description: string | null;
  category: string | null;
}

export interface MockUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  status: "ACTIVE" | "INACTIVE";
  roles: string[];
  facilityScope: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

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
  users: [] as MockUser[],
  unsyncedRoleIds: new Set<string>(),
  lastUserPost: null as Record<string, unknown> | null,
  nextUserId: 1,
  permissions: {} as Record<string, MockPermission[]>,
  // Names gateway already owns in api_permissions — the server refuses to create roles with them.
  reservedRoleNames: new Set(["COMPLIANCE_READ", "INSIGHTS_READ"]),
  lastPermissionsPut: null as { roleId: string; body: { permissions: MockPermission[] } } | null,
  resyncCalls: 0,
  rolesInUse: new Set<string>(),
  lastMenusPut: null as { roleId: string; body: { menuIds: string[] } } | null,
  nextRoleId: 2,
};

export function resetMockDb() {
  mockDb.menus = seedMenus();
  mockDb.roles = seedRoles();
  mockDb.roleMenus = {};
  mockDb.users = [];
  mockDb.unsyncedRoleIds = new Set();
  mockDb.lastUserPost = null;
  mockDb.nextUserId = 1;
  mockDb.permissions = {};
  mockDb.lastPermissionsPut = null;
  mockDb.resyncCalls = 0;
  mockDb.rolesInUse = new Set();
  mockDb.lastMenusPut = null;
  mockDb.nextRoleId = 2;
  syncState.permissionsSyncShouldFail = false;
  syncState.createUserEmailShouldFail = false;
  syncState.createUserKeycloakShouldFail = false;
}

export const handlers = [
  http.get(`${BASE}/me`, () =>
    HttpResponse.json({
      data: { id: "u-1", username: "jdoe", roles: ["SUPER_ADMIN"], facilityScope: null },
    }),
  ),

  http.get(`${BASE}/me/menus`, () => HttpResponse.json({ data: mockDb.menus })),

  // Mirrors GET /users: filters + server-side paging, newest first.
  http.get(`${BASE}/users`, ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const status = url.searchParams.get("status");
    const roleId = url.searchParams.get("roleId");
    const facility = url.searchParams.get("facilityScope")?.toLowerCase();
    const page = Number(url.searchParams.get("page") ?? 0);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    const roleName = roleId ? mockDb.roles.find((r) => r.id === roleId)?.name : undefined;

    const filtered = [...mockDb.users]
      .filter((u) => !status || u.status === status.toUpperCase())
      .filter((u) => !roleId || (roleName !== undefined && u.roles.includes(roleName)))
      .filter((u) => !facility || (u.facilityScope ?? "").toLowerCase() === facility)
      .filter(
        (u) => !q || [u.username, u.email, u.firstName, u.lastName].some((f) => f.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json({
      data: filtered.slice(page * pageSize, (page + 1) * pageSize),
      pagination: { page, pageSize, total: filtered.length },
    });
  }),

  // Mirrors POST /users' outcomes: 409s before anything happens, 502 = rolled back, 201 + warnings.
  http.post(`${BASE}/users`, async ({ request }) => {
    const body = (await request.json()) as {
      username: string;
      email: string;
      firstName: string;
      lastName: string;
      facilityScope?: string;
      roleIds: string[];
    };
    mockDb.lastUserPost = body;
    const email = body.email.toLowerCase();
    if (mockDb.users.some((u) => u.email === email)) {
      return HttpResponse.json({ error: { code: "EMAIL_IN_USE", message: `Email already in use: ${email}` } }, { status: 409 });
    }
    if (mockDb.users.some((u) => u.username === body.username.toLowerCase())) {
      return HttpResponse.json({ error: { code: "USERNAME_IN_USE", message: "Username already in use" } }, { status: 409 });
    }
    const unsynced = body.roleIds.map((id) => mockDb.roles.find((r) => r.id === id)).filter((r) => r && mockDb.unsyncedRoleIds.has(r.id));
    if (unsynced.length > 0) {
      return HttpResponse.json(
        {
          error: {
            code: "ROLE_NOT_SYNCED",
            message: `Role(s) not in Keycloak yet: ${unsynced.map((r) => r!.name).join(", ")} — open the role's Permissions tab and Save or Re-sync first`,
          },
        },
        { status: 409 },
      );
    }
    if (syncState.createUserKeycloakShouldFail) {
      return HttpResponse.json(
        { error: { code: "KEYCLOAK_SYNC_FAILED", message: "Keycloak user creation failed" } },
        { status: 502 },
      );
    }
    const user: MockUser = {
      id: `u-${mockDb.nextUserId++}`,
      username: body.username.toLowerCase(),
      email,
      firstName: body.firstName,
      lastName: body.lastName,
      status: "ACTIVE",
      roles: body.roleIds.map((id) => mockDb.roles.find((r) => r.id === id)?.name ?? id).sort(),
      facilityScope: body.facilityScope ?? null,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
    };
    mockDb.users.push(user);
    const warnings = syncState.createUserEmailShouldFail
      ? ["Invitation email could not be sent — use Reset Password to resend"]
      : undefined;
    return HttpResponse.json({ data: user, ...(warnings ? { warnings } : {}) }, { status: 201 });
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
    if (mockDb.reservedRoleNames.has(body.name)) {
      return HttpResponse.json(
        { error: { code: "ROLE_NAME_RESERVED", message: "Name belongs to an existing gateway permission set" } },
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

  http.get(`${BASE}/roles/:id/permissions`, ({ params }) =>
    HttpResponse.json({ data: { permissions: mockDb.permissions[params.id as string] ?? [] } }),
  ),

  // Mirrors the real endpoint: rows are saved FIRST; a failed sync then answers 502 but keeps them.
  http.put(`${BASE}/roles/:id/permissions`, async ({ params, request }) => {
    const roleId = params.id as string;
    const role = mockDb.roles.find((r) => r.id === roleId);
    if (role?.isSystem) {
      return HttpResponse.json(
        { error: { code: "SYSTEM_ROLE_IMMUTABLE", message: "System role cannot be modified" } },
        { status: 409 },
      );
    }
    const body = (await request.json()) as { permissions: MockPermission[] };
    mockDb.lastPermissionsPut = { roleId, body };
    if (body.permissions.length === 0 && mockDb.rolesInUse.has(roleId)) {
      return HttpResponse.json(
        { error: { code: "ROLE_IN_USE", message: "Users still hold this role; reassign them first" } },
        { status: 409 },
      );
    }
    mockDb.permissions[roleId] = body.permissions.map((p, i) => ({ id: i + 1, ...p }));
    if (syncState.permissionsSyncShouldFail) {
      return HttpResponse.json(
        { error: { code: "KEYCLOAK_SYNC_FAILED", message: "Sync to Keycloak failed" } },
        { status: 502 },
      );
    }
    return HttpResponse.json({ data: { permissions: mockDb.permissions[roleId], syncStatus: "SYNCED" } });
  }),

  http.post(`${BASE}/roles/:id/sync`, ({ params }) => {
    mockDb.resyncCalls += 1;
    if (syncState.permissionsSyncShouldFail) {
      return HttpResponse.json(
        { error: { code: "KEYCLOAK_SYNC_FAILED", message: "Sync to Keycloak failed" } },
        { status: 502 },
      );
    }
    return HttpResponse.json({
      data: { permissions: mockDb.permissions[params.id as string] ?? [], syncStatus: "SYNCED" },
    });
  }),

  http.get(`${BASE}/menus`, () => HttpResponse.json({ data: mockDb.menus })),

  http.get(`${BASE}/health`, () => HttpResponse.json({ status: "UP" })),
];
