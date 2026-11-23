import { request } from "./client";

export interface Menu {
  id: string;
  menuKey: string;
  label: string;
  path: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Full catalog (includes inactive menus), ordered by sort_order. */
export async function listMenus(): Promise<Menu[]> {
  return (await request<Menu[]>("/menus")).data;
}
