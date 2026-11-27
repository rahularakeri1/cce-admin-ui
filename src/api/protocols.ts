import { requestProtocol } from "./protocolClient";

export type ProtocolStatus = "ACTIVE" | "RETIRED";

export interface ProtocolDefinition {
  id: string;
  url: string;
  version: string;
  canonical: string;
  status: ProtocolStatus;
  loadedAt: string;
  /** The stored FHIR PlanDefinition. Included in list items too (the service returns the same DTO). */
  definition: Record<string, unknown>;
}

export interface ProtocolPage {
  items: ProtocolDefinition[];
  total: number;
  totalPages: number;
  /** Zero-based. */
  page: number;
  size: number;
}

interface SpringPage {
  content: ProtocolDefinition[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export async function listProtocols(page: number, size: number): Promise<ProtocolPage> {
  const res = await requestProtocol<SpringPage>(`/protocol-definitions?page=${page}&size=${size}&sort=loadedAt,desc`);
  return { items: res.content, total: res.totalElements, totalPages: res.totalPages, page: res.number, size: res.size };
}

export function getProtocol(id: string): Promise<ProtocolDefinition> {
  return requestProtocol<ProtocolDefinition>(`/protocol-definitions/${encodeURIComponent(id)}`);
}

/** `planDefinitionJson` is the PlanDefinition resource AS A STRING — exactly what the service expects. */
export function uploadProtocol(planDefinitionJson: string): Promise<ProtocolDefinition> {
  return requestProtocol<ProtocolDefinition>("/protocol-definitions", {
    method: "POST",
    body: JSON.stringify({ planDefinitionJson }),
  });
}

export function retireProtocol(id: string): Promise<ProtocolDefinition> {
  return requestProtocol<ProtocolDefinition>(`/protocol-definitions/${encodeURIComponent(id)}/retire`, { method: "POST" });
}
