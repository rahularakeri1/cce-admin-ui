import { request } from "./client";

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleInput {
  name: string;
  displayName: string;
  description?: string;
}

export async function listRoles(): Promise<Role[]> {
  return (await request<Role[]>("/roles")).data;
}

export async function getRole(id: string): Promise<Role> {
  return (await request<Role>(`/roles/${id}`)).data;
}

export async function createRole(input: CreateRoleInput): Promise<Role> {
  return (await request<Role>("/roles", { method: "POST", body: JSON.stringify(input) })).data;
}

export async function deleteRole(id: string): Promise<void> {
  await request<void>(`/roles/${id}`, { method: "DELETE" });
}

export async function getRoleMenuIds(id: string): Promise<string[]> {
  return (await request<{ menuIds: string[] }>(`/roles/${id}/menus`)).data.menuIds;
}

/** Full-replacement: always the complete desired set, never a diff. */
export async function replaceRoleMenus(id: string, menuIds: string[]): Promise<string[]> {
  const res = await request<{ menuIds: string[] }>(`/roles/${id}/menus`, {
    method: "PUT",
    body: JSON.stringify({ menuIds }),
  });
  return res.data.menuIds;
}

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface Permission {
  id?: number;
  httpMethod: HttpMethod;
  uriPattern: string;
  description: string | null;
  category: string | null;
}

export interface PermissionsResult {
  permissions: Permission[];
  /** "SYNCED" only on a response that follows a successful gateway sync. */
  syncStatus?: "SYNCED";
}

export async function getRolePermissions(id: string): Promise<Permission[]> {
  return (await request<PermissionsResult>(`/roles/${id}/permissions`)).data.permissions;
}

/** Saves the complete set. A 502 KEYCLOAK_SYNC_FAILED means the rows ARE saved but the sync failed. */
export async function replaceRolePermissions(id: string, permissions: Permission[]): Promise<PermissionsResult> {
  const body = permissions.map(({ httpMethod, uriPattern, description, category }) => ({
    httpMethod,
    uriPattern,
    description: description || null,
    category: category || null,
  }));
  return (
    await request<PermissionsResult>(`/roles/${id}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions: body }),
    })
  ).data;
}

/** Re-runs the gateway sync without changing any row. */
export async function resyncRole(id: string): Promise<PermissionsResult> {
  return (await request<PermissionsResult>(`/roles/${id}/sync`, { method: "POST" })).data;
}
