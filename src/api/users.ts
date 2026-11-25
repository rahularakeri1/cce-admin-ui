import { request, type PageMeta } from "./client";

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  status: "ACTIVE" | "INACTIVE";
  roles: string[];
  facilityScope: string | null;
  /** System-created account (the bootstrap admin): read-only in the console. */
  isSystem: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserListParams {
  q?: string;
  status?: string;
  roleId?: string;
  facilityScope?: string;
  page?: number;
  pageSize?: number;
}

export interface UserList {
  users: User[];
  pagination: PageMeta;
}

export interface CreateUserInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  facilityScope?: string;
  roleIds: string[];
}

export interface CreatedUser {
  user: User;
  /** Non-fatal: e.g. the invitation email could not be sent. */
  warnings: string[];
}

export async function listUsers(params: UserListParams): Promise<UserList> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  const res = await request<User[]>(`/users${qs ? `?${qs}` : ""}`);
  return { users: res.data, pagination: res.pagination ?? { page: 0, pageSize: res.data.length, total: res.data.length } };
}

export async function createUser(input: CreateUserInput): Promise<CreatedUser> {
  const res = await request<User>("/users", { method: "POST", body: JSON.stringify(input) });
  return { user: res.data, warnings: res.warnings ?? [] };
}

export interface UpdateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  facilityScope?: string;
}

export async function getUser(id: string): Promise<User> {
  return (await request<User>(`/users/${id}`)).data;
}

/** Profile only. A changed email is re-verified server-side; a failed verification email is a warning. */
export async function updateUser(id: string, input: UpdateUserInput): Promise<CreatedUser> {
  const res = await request<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(input) });
  return { user: res.data, warnings: res.warnings ?? [] };
}

export async function setUserStatus(id: string, status: User["status"]): Promise<User> {
  return (await request<User>(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) })).data;
}

/** Full replacement: always the complete desired role set. */
export async function replaceUserRoles(id: string, roleIds: string[]): Promise<User> {
  return (await request<User>(`/users/${id}/roles`, { method: "PUT", body: JSON.stringify({ roleIds }) })).data;
}

/** Resend or genuine reset: emails the same verify + set-password link as creation. */
export async function resetUserPassword(id: string): Promise<void> {
  await request<{ sent: boolean }>(`/users/${id}/reset-password`, { method: "POST" });
}
