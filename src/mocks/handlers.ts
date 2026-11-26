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
  isSystem?: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export const ADMIN_MENU_KEYS = ["admin-users", "admin-roles", "admin-menus", "admin-protocols"];

// Insights menus first, then the four admin console tabs — the order GET /menus answers in.
const seedMenus = () => [
  { id: "m-1", menuKey: "dashboard", label: "Dashboard", path: "/", icon: "ChartBarIcon", console: "INSIGHTS", sortOrder: 1, isActive: true },
  { id: "m-2", menuKey: "facilities", label: "Facilities", path: "/facilities", icon: "BuildingOffice2Icon", console: "INSIGHTS", sortOrder: 2, isActive: true },
  { id: "m-3", menuKey: "compliance", label: "Compliance", path: "/compliance", icon: "ClipboardDocumentCheckIcon", console: "INSIGHTS", sortOrder: 3, isActive: true },
  { id: "m-a1", menuKey: "admin-users", label: "Users", path: "/users", icon: "UsersIcon", console: "ADMIN", sortOrder: 1, isActive: true },
  { id: "m-a2", menuKey: "admin-roles", label: "Roles", path: "/roles", icon: "ShieldCheckIcon", console: "ADMIN", sortOrder: 2, isActive: true },
  { id: "m-a3", menuKey: "admin-menus", label: "Menus", path: "/menus", icon: "Bars3Icon", console: "ADMIN", sortOrder: 3, isActive: true },
  { id: "m-a4", menuKey: "admin-protocols", label: "Protocols", path: "/protocols", icon: "DocumentTextIcon", console: "ADMIN", sortOrder: 4, isActive: true },
];

// Mirrors cce-protocol-service's ProtocolDefinitionDto (see cce-admin-service docs/api-reference.md, Protocols).
export interface MockProtocol {
  id: string;
  url: string;
  version: string;
  canonical: string;
  status: "ACTIVE" | "RETIRED";
  loadedAt: string;
  definition: Record<string, unknown>;
}

const mockProtocol = (n: number, url: string, version: string, status: "ACTIVE" | "RETIRED", loadedAt: string): MockProtocol => ({
  id: `p-${n}`,
  url,
  version,
  canonical: `${url}|${version}`,
  status,
  loadedAt,
  definition: { resourceType: "PlanDefinition", url, version, status: "active", action: [{ id: "a1" }, { id: "a2" }] },
});

// Newest first is applied by the handler, as the real service does with sort=loadedAt,desc.
const seedProtocols = (): MockProtocol[] => [
  mockProtocol(1, "http://openphc.org/PlanDefinition/emr-service-protocol", "1.0.0", "ACTIVE", "2026-10-26T10:49:36Z"),
  mockProtocol(2, "http://openphc.org/PlanDefinition/anc", "2.1.0", "RETIRED", "2026-10-02T08:00:00Z"),
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
  // The admin tabs (menu keys) the signed-in user's roles carry; the default mock user is a SUPER_ADMIN.
  myAdminMenuKeys: [...ADMIN_MENU_KEYS],
  meMenusCalls: [] as string[],
  users: [] as MockUser[],
  unsyncedRoleIds: new Set<string>(),
  // The next call to any /users/:id action answers with this error, once — lets a test stage 409s/502s.
  failNext: null as { status: number; code: string; message: string } | null,
  lastUserPut: null as Record<string, unknown> | null,
  lastStatusPatch: null as string | null,
  lastRolesPut: null as string[] | null,
  resetCalls: 0,
  userFetches: 0,
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
  protocols: seedProtocols(),
  nextProtocolId: 3,
  lastProtocolUpload: null as { planDefinitionJson: string } | null,
  protocolUploadCalls: 0,
  protocolListCalls: 0,
  // The next protocol call answers with this instead, once — a staged gateway 403, 5xx, etc.
  protocolFailNext: null as { status: number; body: unknown } | null,
};

export function resetMockDb() {
  mockDb.menus = seedMenus();
  mockDb.roles = seedRoles();
  mockDb.roleMenus = {};
  mockDb.myAdminMenuKeys = [...ADMIN_MENU_KEYS];
  mockDb.meMenusCalls = [];
  mockDb.users = [];
  mockDb.unsyncedRoleIds = new Set();
  mockDb.failNext = null;
  mockDb.lastUserPut = null;
  mockDb.lastStatusPatch = null;
  mockDb.lastRolesPut = null;
  mockDb.resetCalls = 0;
  mockDb.userFetches = 0;
  mockDb.lastUserPost = null;
  mockDb.nextUserId = 1;
  mockDb.permissions = {};
  mockDb.lastPermissionsPut = null;
  mockDb.resyncCalls = 0;
  mockDb.rolesInUse = new Set();
  mockDb.lastMenusPut = null;
  mockDb.nextRoleId = 2;
  mockDb.protocols = seedProtocols();
  mockDb.nextProtocolId = 3;
  mockDb.lastProtocolUpload = null;
  mockDb.protocolUploadCalls = 0;
  mockDb.protocolListCalls = 0;
  mockDb.protocolFailNext = null;
  syncState.permissionsSyncShouldFail = false;
  syncState.createUserEmailShouldFail = false;
  syncState.createUserKeycloakShouldFail = false;
}

/** Consumes mockDb.failNext, if a test staged one. */
function takeFailure() {
  const fail = mockDb.failNext;
  mockDb.failNext = null;
  return fail ? HttpResponse.json({ error: { code: fail.code, message: fail.message } }, { status: fail.status }) : null;
}

/** A staged protocol-call failure, consumed once (see mockDb.protocolFailNext). */
function takeProtocolFailure() {
  const fail = mockDb.protocolFailNext;
  mockDb.protocolFailNext = null;
  return fail ? HttpResponse.json(fail.body as Record<string, unknown>, { status: fail.status }) : null;
}

/** What the gateway actually answers in the two cases it answers itself (checked live). */
export const GATEWAY_403 = { status: 403, body: { error: "Forbidden", message: "Access denied: Insufficient permissions", status: 403 } };
/** The gateway's CORS refusal: an EMPTY 403 (checked live), before any permission check. */
export const GATEWAY_CORS_403 = { status: 403, body: null };
export const GATEWAY_DOWN_500 = {
  status: 500,
  body: { timestamp: "2026-11-26T11:48:46Z", path: "/v1/protocol/protocol-definitions", status: 500, error: "Internal Server Error", requestId: "r-1" },
};

const protocolError = (status: number, error: string, message: string) =>
  HttpResponse.json({ status, error, message, timestamp: "2026-11-26T11:00:00Z" }, { status });

const PROTOCOLS = "*/v1/protocol/protocol-definitions";

export const handlers = [
  // ---- cce-protocol-service, as reached through the gateway ---------------------------------------
  http.get(PROTOCOLS, ({ request }) => {
    mockDb.protocolListCalls += 1;
    const failure = takeProtocolFailure();
    if (failure) return failure;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 0);
    const size = Number(url.searchParams.get("size") ?? 20);
    const sorted = [...mockDb.protocols].sort((a, b) => b.loadedAt.localeCompare(a.loadedAt));
    return HttpResponse.json({
      content: sorted.slice(page * size, page * size + size),
      totalElements: sorted.length,
      totalPages: Math.max(1, Math.ceil(sorted.length / size)),
      number: page,
      size,
    });
  }),
  http.get(`${PROTOCOLS}/:id`, ({ params }) => {
    const failure = takeProtocolFailure();
    if (failure) return failure;
    const found = mockDb.protocols.find((p) => p.id === params.id);
    return found ? HttpResponse.json(found) : protocolError(404, "Not Found", `Protocol definition not found: ${String(params.id)}`);
  }),
  http.post(PROTOCOLS, async ({ request }) => {
    mockDb.protocolUploadCalls += 1;
    const body = (await request.json()) as { planDefinitionJson: string };
    mockDb.lastProtocolUpload = body;
    const failure = takeProtocolFailure();
    if (failure) return failure;
    let doc: { url?: string; version?: string };
    try {
      doc = JSON.parse(body.planDefinitionJson);
    } catch {
      return protocolError(422, "Unprocessable Entity", "HAPI-1861: Failed to parse JSON encoded FHIR content");
    }
    if (mockDb.protocols.some((p) => p.url === doc.url && p.version === doc.version)) {
      return protocolError(400, "Bad Request", `Protocol definition already exists for url=${doc.url}, version=${doc.version}`);
    }
    const created = mockProtocol(mockDb.nextProtocolId++, doc.url ?? "", doc.version ?? "", "ACTIVE", new Date().toISOString());
    created.definition = doc as Record<string, unknown>;
    mockDb.protocols.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.post(`${PROTOCOLS}/:id/retire`, ({ params }) => {
    const failure = takeProtocolFailure();
    if (failure) return failure;
    const found = mockDb.protocols.find((p) => p.id === params.id);
    if (!found) return protocolError(404, "Not Found", `Protocol definition not found: ${String(params.id)}`);
    if (found.status === "RETIRED") return protocolError(409, "Conflict", `Protocol definition is already retired: ${found.id}`);
    found.status = "RETIRED";
    return HttpResponse.json(found);
  }),

  // ---- cce-admin-service ----------------------------------------------------------------------------
  http.get(`${BASE}/me`, () =>
    HttpResponse.json({
      data: { id: "u-1", username: "jdoe", roles: ["SUPER_ADMIN"], facilityScope: null },
    }),
  ),

  // Mirrors GET /me/menus?console= (default INSIGHTS); the admin tabs are whatever mockDb.myAdminMenuKeys says.
  http.get(`${BASE}/me/menus`, ({ request }) => {
    const console = new URL(request.url).searchParams.get("console") ?? "INSIGHTS";
    mockDb.meMenusCalls.push(console);
    const failure = takeFailure();
    if (failure) return failure;
    const menus = mockDb.menus
      .filter((m) => m.console === console)
      .filter((m) => console !== "ADMIN" || mockDb.myAdminMenuKeys.includes(m.menuKey))
      .map(({ id, label, path, icon }) => ({ id, label, path, icon }));
    return HttpResponse.json({ data: menus });
  }),

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

  http.get(`${BASE}/users/:id`, ({ params }) => {
    mockDb.userFetches += 1;
    const user = mockDb.users.find((u) => u.id === params.id);
    if (!user) return HttpResponse.json({ error: { code: "USER_NOT_FOUND", message: "No such user" } }, { status: 404 });
    return HttpResponse.json({ data: user });
  }),

  // Mirrors PUT /users/:id (profile): email uniqueness 409, warnings when the verification email fails.
  http.put(`${BASE}/users/:id`, async ({ params, request }) => {
    const fail = takeFailure();
    if (fail) return fail;
    const user = mockDb.users.find((u) => u.id === params.id);
    if (!user) return HttpResponse.json({ error: { code: "USER_NOT_FOUND", message: "No such user" } }, { status: 404 });
    if (user.isSystem) {
      return HttpResponse.json(
        { error: { code: "SYSTEM_USER_IMMUTABLE", message: `System account ${user.username} cannot be edited, deactivated or have its roles changed from the console` } },
        { status: 409 },
      );
    }
    const body = (await request.json()) as { firstName: string; lastName: string; email: string; facilityScope?: string };
    mockDb.lastUserPut = body;
    const email = body.email.toLowerCase();
    if (mockDb.users.some((u) => u.id !== user.id && u.email === email)) {
      return HttpResponse.json({ error: { code: "EMAIL_IN_USE", message: `Email already in use: ${email}` } }, { status: 409 });
    }
    const emailChanged = email !== user.email;
    Object.assign(user, { firstName: body.firstName, lastName: body.lastName, email, facilityScope: body.facilityScope ?? null });
    const warnings =
      emailChanged && syncState.createUserEmailShouldFail
        ? ["The new email address was saved, but the verification email could not be sent — use Reset Password to resend"]
        : undefined;
    return HttpResponse.json({ data: user, ...(warnings ? { warnings } : {}) });
  }),

  http.patch(`${BASE}/users/:id/status`, async ({ params, request }) => {
    const fail = takeFailure();
    if (fail) return fail;
    const user = mockDb.users.find((u) => u.id === params.id);
    if (!user) return HttpResponse.json({ error: { code: "USER_NOT_FOUND", message: "No such user" } }, { status: 404 });
    if (user.isSystem) {
      return HttpResponse.json(
        { error: { code: "SYSTEM_USER_IMMUTABLE", message: `System account ${user.username} cannot be edited, deactivated or have its roles changed from the console` } },
        { status: 409 },
      );
    }
    const body = (await request.json()) as { status: "ACTIVE" | "INACTIVE" };
    mockDb.lastStatusPatch = body.status;
    user.status = body.status; // roles are kept, like the real endpoint
    return HttpResponse.json({ data: user });
  }),

  http.put(`${BASE}/users/:id/roles`, async ({ params, request }) => {
    const fail = takeFailure();
    if (fail) return fail;
    const user = mockDb.users.find((u) => u.id === params.id);
    if (!user) return HttpResponse.json({ error: { code: "USER_NOT_FOUND", message: "No such user" } }, { status: 404 });
    if (user.isSystem) {
      return HttpResponse.json(
        { error: { code: "SYSTEM_USER_IMMUTABLE", message: `System account ${user.username} cannot be edited, deactivated or have its roles changed from the console` } },
        { status: 409 },
      );
    }
    const body = (await request.json()) as { roleIds: string[] };
    mockDb.lastRolesPut = body.roleIds;
    user.roles = body.roleIds.map((rid) => mockDb.roles.find((r) => r.id === rid)?.name ?? rid).sort();
    return HttpResponse.json({ data: user });
  }),

  http.post(`${BASE}/users/:id/reset-password`, ({ params }) => {
    const fail = takeFailure();
    if (fail) return fail;
    const user = mockDb.users.find((u) => u.id === params.id);
    if (!user) return HttpResponse.json({ error: { code: "USER_NOT_FOUND", message: "No such user" } }, { status: 404 });
    if (user.status !== "ACTIVE") {
      return HttpResponse.json({ error: { code: "USER_NOT_ACTIVE", message: "User is not active" } }, { status: 409 });
    }
    mockDb.resetCalls += 1;
    return HttpResponse.json({ data: { sent: true } });
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
    // The server's two tab rules (cce-admin-service RoleService.enforceAdminTabRules).
    const role = mockDb.roles.find((r) => r.id === params.id);
    const wanted = mockDb.menus.filter((m) => body.menuIds.includes(m.id));
    if (role?.name === "SUPER_ADMIN") {
      const missing = mockDb.menus.filter((m) => m.console === "ADMIN" && !body.menuIds.includes(m.id));
      if (missing.length > 0) {
        return HttpResponse.json(
          { error: { code: "ADMIN_MENU_REQUIRED", message: "SUPER_ADMIN must keep every admin console tab" } },
          { status: 409 },
        );
      }
    } else if (wanted.some((m) => ["admin-users", "admin-roles", "admin-menus"].includes(m.menuKey))) {
      return HttpResponse.json(
        { error: { code: "ADMIN_MENU_SUPER_ADMIN_ONLY", message: "Those tabs can only be assigned to SUPER_ADMIN" } },
        { status: 409 },
      );
    }
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
