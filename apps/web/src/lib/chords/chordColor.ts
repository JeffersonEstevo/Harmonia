const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

/** Fundamental do acorde ("F#m7" → "F#", "Bb" → "A#"), ou null se não reconhecer. */
export function chordRoot(symbol: string): string | null {
  const m = /^([A-G])([#b]?)/.exec(symbol);
  if (!m) return null;
  const root = m[1] + m[2];
  return FLAT_TO_SHARP[root] ?? root;
}

/**
 * Matiz (0–360) por fundamental — 12 matizes, um por semitom. A qualidade
 * (m/7) fica só no texto: cor nunca é o único codificador de informação
 * (docs/SPEC.md §4.1, acessibilidade). Compartilhado entre o canvas, o SVG
 * exportado e o PDF pra o mesmo acorde ter a mesma cor em todo lugar.
 */
export function chordHue(symbol: string): number {
  const root = chordRoot(symbol);
  const index = root ? NOTE_NAMES.indexOf(root) : -1;
  return (Math.max(0, index) * 360) / 12;
}

export function chordColor(symbol: string, alpha = 0.55): string {
  return `hsla(${chordHue(symbol)}, 45%, 58%, ${alpha})`;
}
