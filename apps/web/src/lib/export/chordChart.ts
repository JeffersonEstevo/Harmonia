import type { ExportableAnalysis } from "./types";

export interface ChartCell {
  chord: string | null; // null = nenhum acorde detectado ("N.C.")
  beats: number;
}
export interface ChartBar {
  startTime: number;
  cells: ChartCell[];
}
export interface ChartLine {
  startTime: number;
  bars: ChartBar[];
}
export interface ChordChart {
  /** "bars": compassos montados da grade de batidas; "timeline": 1 acorde por quadro (sem batidas confiáveis) */
  mode: "bars" | "timeline";
  beatsPerBar: number;
  barsPerLine: number;
  lines: ChartLine[];
}

export const BEATS_PER_BAR = 4;
export const BARS_PER_LINE = 4;
const MIN_BEATS_FOR_BARS = 8;

type Segment = ExportableAnalysis["chordSegments"][number];

function chordAt(segments: Segment[], t: number): string | null {
  for (const seg of segments) {
    if (t >= seg.onset && t < seg.offset) return seg.chord;
  }
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function chunkIntoLines(bars: ChartBar[]): ChartLine[] {
  const lines: ChartLine[] = [];
  for (let i = 0; i < bars.length; i += BARS_PER_LINE) {
    const slice = bars.slice(i, i + BARS_PER_LINE);
    lines.push({ startTime: slice[0].startTime, bars: slice });
  }
  return lines;
}

/**
 * Monta a cifra. Com grade de batidas utilizável, agrupa em compassos
 * assumindo 4/4 a partir da PRIMEIRA batida detectada — fórmula de compasso
 * e tempo forte (downbeat) NÃO são detectados ainda (docs/SPEC.md §4.5), então
 * a divisão em compassos pode estar deslocada em músicas com anacruse ou
 * fora de 4/4. Sem batidas confiáveis, cai pra uma linha do tempo simples.
 * Acordes antes da primeira batida (intro) ficam de fora no modo "bars".
 */
export function buildChordChart(a: ExportableAnalysis): ChordChart {
  const segments = [...a.chordSegments].sort((x, y) => x.onset - y.onset);
  const beats = a.beatGrid.filter((t) => Number.isFinite(t)).sort((x, y) => x - y);

  if (beats.length >= MIN_BEATS_FOR_BARS) {
    const diffs = beats.slice(1).map((t, i) => t - beats[i]);
    const interval = median(diffs);
    const bars: ChartBar[] = [];

    for (let start = 0; start < beats.length; start += BEATS_PER_BAR) {
      const barBeats = beats.slice(start, start + BEATS_PER_BAR);
      const cells: ChartCell[] = [];
      for (const t of barBeats) {
        // amostra um pouco DEPOIS do início da batida: a troca de acorde
        // costuma ser detectada com alguma defasagem em relação ao transiente
        const chord = chordAt(segments, t + interval * 0.25);
        const last = cells[cells.length - 1];
        if (last && last.chord === chord) last.beats += 1;
        else cells.push({ chord, beats: 1 });
      }
      bars.push({ startTime: barBeats[0], cells });
    }
    return {
      mode: "bars",
      beatsPerBar: BEATS_PER_BAR,
      barsPerLine: BARS_PER_LINE,
      lines: chunkIntoLines(bars),
    };
  }

  const bars: ChartBar[] = segments.map((seg) => ({
    startTime: seg.onset,
    cells: [{ chord: seg.chord, beats: BEATS_PER_BAR }],
  }));
  return {
    mode: "timeline",
    beatsPerBar: BEATS_PER_BAR,
    barsPerLine: BARS_PER_LINE,
    lines: chunkIntoLines(bars),
  };
}
