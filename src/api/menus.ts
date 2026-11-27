import { request } from "./client";

export type ConsoleName = "INSIGHTS" | "ADMIN";

export interface Menu {
  id: string;
  menuKey: string;
  label: string;
  path: string;
  icon: string | null;
  /** INSIGHTS = cce-insights-ui's sidebar; ADMIN = this console's own tabs (Milestone 7). */
  console: ConsoleName;
  sortOrder: number;
  isActive: boolean;
}

/**
 * The admin tabs only a SUPER_ADMIN may hold — the server answers 409 for any other role, so the Menus tab
 * greys them out. Protocols (admin-protocols) is deliberately assignable to other roles. Mirrors
 * cce-admin-service's RoleService.SUPER_ADMIN_ONLY_TABS.
 */
export const SUPER_ADMIN_ONLY_MENU_KEYS: ReadonlySet<string> = new Set(["admin-users", "admin-roles", "admin-menus"]);

/** Full catalog (includes inactive menus): the insights menus first, then the admin tabs. */
export async function listMenus(): Promise<Menu[]> {
  return (await request<Menu[]>("/menus")).data;
}

/**
 * Body of POST and PUT /menus. On create a missing sortOrder is 0 and a missing isActive is true; on update they
 * mean "unchanged" — the UI always sends everything. `console` is never sent: new entries are always INSIGHTS.
 */
export interface MenuInput {
  menuKey: string;
  label: string;
  path: string;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export async function createMenu(input: MenuInput): Promise<Menu> {
  return (await request<Menu>("/menus", { method: "POST", body: JSON.stringify(input) })).data;
}

export async function updateMenu(id: string, input: MenuInput): Promise<Menu> {
  return (await request<Menu>(`/menus/${id}`, { method: "PUT", body: JSON.stringify(input) })).data;
}

/** Permanent. Also removes the entry from every role that held it (their other menus are untouched). */
export async function deleteMenu(id: string): Promise<void> {
  await request<void>(`/menus/${id}`, { method: "DELETE" });
}
