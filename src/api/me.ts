import { request } from "./client";

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
