/**
 * Cliente de API do api-gateway — health-check (Fase 0), auth e biblioteca
 * de faixas (Fase 5). Ver docs/SPEC.md §6.6.
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

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

async function throwApiError(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({ error: `Erro ${res.status}` }));
  throw new Error(body.error ?? `Erro ${res.status}`);
}

export async function registerUser(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName }),
  });
  if (!res.ok) return throwApiError(res);
  return res.json();
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return throwApiError(res);
  return res.json();
}

export function googleLoginUrl(): string {
  return `${API_BASE_URL}/api/auth/google`;
}

export interface SavedTrackSummary {
  id: string;
  title: string;
  durationSec: number;
  originalFormat: string;
  uploadedAt: string;
  visibility: string;
}

export interface SavedTrackDetail extends SavedTrackSummary {
  analysis: {
    chordSegments: { chord: string; onset: number; offset: number; confidence: number }[];
    key: string | null;
    keyScale: string | null;
    bpm: number | null;
    beatGrid: number[];
  } | null;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function saveTrackToLibrary(
  token: string,
  file: File,
  meta: {
    title: string;
    durationSec: number;
    chordSegments: { chord: string; onset: number; offset: number; confidence?: number }[];
    key: string | null;
    keyScale: string | null;
    bpm: number | null;
    beatGrid: number[];
  },
): Promise<SavedTrackSummary> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", meta.title);
  formData.append("durationSec", String(meta.durationSec));
  formData.append("chordSegments", JSON.stringify(meta.chordSegments));
  if (meta.key) formData.append("key", meta.key);
  if (meta.keyScale) formData.append("keyScale", meta.keyScale);
  if (meta.bpm) formData.append("bpm", String(meta.bpm));
  formData.append("beatGrid", JSON.stringify(meta.beatGrid));

  const res = await fetch(`${API_BASE_URL}/api/tracks`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  if (!res.ok) return throwApiError(res);
  return res.json();
}

export async function listSavedTracks(token: string): Promise<SavedTrackSummary[]> {
  const res = await fetch(`${API_BASE_URL}/api/tracks`, { headers: authHeaders(token) });
  if (!res.ok) return throwApiError(res);
  return res.json();
}

export async function getSavedTrack(token: string, id: string): Promise<SavedTrackDetail> {
  const res = await fetch(`${API_BASE_URL}/api/tracks/${id}`, { headers: authHeaders(token) });
  if (!res.ok) return throwApiError(res);
  return res.json();
}

export async function getSavedTrackAudio(token: string, id: string, title: string): Promise<File> {
  const res = await fetch(`${API_BASE_URL}/api/tracks/${id}/audio`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return throwApiError(res);
  const blob = await res.blob();
  return new File([blob], title, { type: blob.type });
}

export async function renameSavedTrack(
  token: string,
  id: string,
  title: string,
): Promise<SavedTrackSummary> {
  const res = await fetch(`${API_BASE_URL}/api/tracks/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) return throwApiError(res);
  return res.json();
}

export async function deleteSavedTrack(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/tracks/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok && res.status !== 204) return throwApiError(res);
}
