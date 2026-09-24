export interface ChordSegment {
  chord: string;
  onset: number;
  offset: number;
}

export interface AnalysisResult {
  chordSegments: ChordSegment[];
  bpm: number | null;
  beatGrid: number[];
}

const ANALYSIS_TIMEOUT_MS = 20_000;

/**
 * Roda a análise Nível 1 (WASM) num Web Worker dedicado, fora da thread
 * principal — ver docs/SPEC.md §6.2. Uma Promise por chamada; o worker é
 * descartado ao final (análises são raras — uma por faixa carregada — não
 * vale manter um worker de longa duração por ora).
 */
export function analyzeTrack(
  channelData: Float32Array,
  sampleRate: number,
  durationSeconds: number,
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/workers/analysis-worker.js", { type: "module" });

    // rede de segurança: se o worker nunca responder (por qualquer motivo,
    // conhecido ou não), falha de forma visível em vez de travar pra sempre
    // a UI em "analisando" — ver docs/DECISIONS.md.
    const timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new Error("Tempo limite da análise excedido"));
    }, ANALYSIS_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent) => {
      clearTimeout(timeoutId);
      const data = event.data;
      worker.terminate();
      if (data.type === "result") {
        resolve({ chordSegments: data.chordSegments, bpm: data.bpm, beatGrid: data.beatGrid });
      } else {
        reject(new Error(data.message ?? "Falha desconhecida na análise"));
      }
    };

    worker.onerror = (event) => {
      clearTimeout(timeoutId);
      worker.terminate();
      reject(new Error(event.message));
    };

    // copia os dados antes de transferir — quem chamou pode ainda precisar
    // do buffer original (ex.: a pirâmide de picos já construída a partir dele)
    const transferable = channelData.slice();
    worker.postMessage(
      { channelData: transferable, sampleRate, durationSeconds },
      [transferable.buffer],
    );
  });
}
