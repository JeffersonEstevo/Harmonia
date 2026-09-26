import type { ChordSegment } from "./analysisClient";

export interface Tier2Result {
  chordSegments: ChordSegment[];
  key: string | null;
  keyScale: string | null;
  keyConfidence: number;
  bpm: number | null;
  beatGrid: number[];
}

const TIER2_BASE_URL = import.meta.env.VITE_ANALYSIS_SERVICE_URL ?? "http://localhost:8001";
const TIER2_TIMEOUT_MS = 120_000;

interface JobResponse {
  status: "queued" | "processing" | "done" | "error";
  result?: {
    chordSegments: { chord: string; onset: number; offset: number; confidence: number }[];
    key: string | null;
    keyScale: string | null;
    keyConfidence: number;
    bpm: number | null;
    beatGrid: number[];
  };
  error?: string | null;
}

/**
 * Camada 2 (Tier 2) — envia o arquivo original pro analysis-service
 * (Python + essentia), acompanha o job via WebSocket (com fallback pra
 * polling se o WS falhar) e resolve com o resultado, bem mais preciso que
 * o Nível 1. Ver docs/SPEC.md §4.4 e docs/DECISIONS.md.
 */
export async function analyzeTier2(file: File): Promise<Tier2Result> {
  const formData = new FormData();
  formData.append("file", file);

  const uploadRes = await fetch(`${TIER2_BASE_URL}/analyze`, {
    method: "POST",
    body: formData,
  });
  if (!uploadRes.ok) {
    throw new Error(`Falha no upload pra Camada 2: ${uploadRes.status}`);
  }
  const { job_id: jobId } = (await uploadRes.json()) as { job_id: string };

  const data = await waitForResultViaWebSocket(jobId).catch(() => pollForResult(jobId));

  if (data.status === "error" || !data.result) {
    throw new Error(data.error ?? "Falha desconhecida na análise da Camada 2");
  }

  return {
    chordSegments: data.result.chordSegments.map((s) => ({
      chord: s.chord,
      onset: s.onset,
      offset: s.offset,
    })),
    key: data.result.key,
    keyScale: data.result.keyScale,
    keyConfidence: data.result.keyConfidence,
    bpm: data.result.bpm,
    beatGrid: data.result.beatGrid,
  };
}

function waitForResultViaWebSocket(jobId: string): Promise<JobResponse> {
  return new Promise((resolve, reject) => {
    const wsUrl = TIER2_BASE_URL.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsUrl}/ws/jobs/${jobId}`);

    const timeoutId = setTimeout(() => {
      ws.close();
      reject(new Error("timeout"));
    }, TIER2_TIMEOUT_MS);

    ws.onmessage = (event) => {
      clearTimeout(timeoutId);
      resolve(JSON.parse(event.data) as JobResponse);
      ws.close();
    };
    ws.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error("WebSocket falhou"));
    };
  });
}

async function pollForResult(jobId: string): Promise<JobResponse> {
  const start = Date.now();
  while (Date.now() - start < TIER2_TIMEOUT_MS) {
    const res = await fetch(`${TIER2_BASE_URL}/jobs/${jobId}`);
    const data = (await res.json()) as JobResponse;
    if (data.status === "done" || data.status === "error") return data;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { status: "error", error: "tempo limite excedido" };
}
