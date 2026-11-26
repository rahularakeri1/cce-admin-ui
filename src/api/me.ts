import { request } from "./client";
import type { ConsoleName } from "./menus";

export interface Me {
  id: string;
  username: string;
  roles: string[];
  facilityScope: string | null;
}

export async function getMe(): Promise<Me> {
  const { data } = await request<Me>("/me");
  return data;
}

/** One sidebar entry from GET /me/menus — only what a console needs to render a link. */
export interface MyMenu {
  id: string;
  label: string;
  path: string;
  icon: string | null;
}

/** The caller's menus for one console, from the DATABASE roles (so a role change shows on the next call). */
export async function getMyMenus(console: ConsoleName): Promise<MyMenu[]> {
  return (await request<MyMenu[]>(`/me/menus?console=${console}`)).data;
}
