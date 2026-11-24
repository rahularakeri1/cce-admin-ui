import { request, type PageMeta } from "./client";

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  roles: string[];
  facilityScope: string | null;
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
