/** Tudo que os exportadores precisam — independente de onde veio (tela, biblioteca, link). */
export interface ExportableAnalysis {
  title: string;
  durationSec: number;
  key: string | null;
  keyScale: string | null;
  bpm: number | null;
  beatGrid: number[];
  chordSegments: { chord: string; onset: number; offset: number; confidence?: number }[];
  /** envelope da waveform: pares [min, max] intercalados (ver overviewPeaks.ts) */
  peaks?: number[] | null;
}

export function keyLabel(a: Pick<ExportableAnalysis, "key" | "keyScale">): string | null {
  if (!a.key) return null;
  return a.keyScale === "minor" ? `${a.key}m` : a.key;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Nome de arquivo seguro: sem separadores de caminho/caracteres reservados, tamanho limitado. */
export function safeFilename(title: string, extension: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
  return `${cleaned || "harmonia"}.${extension}`;
}
