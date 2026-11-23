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
