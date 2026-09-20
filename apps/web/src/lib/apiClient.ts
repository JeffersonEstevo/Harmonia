/**
 * Cliente de API mínimo para o API Gateway.
 * Será substituído por um cliente tipado (gerado a partir de packages/api-contracts/openapi.yaml)
 * assim que o contrato de API crescer além do health-check.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  timestamp: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) {
    throw new Error(`Health check falhou: ${res.status}`);
  }
  return res.json();
}
