import { keyLabel, type ExportableAnalysis } from "./types";

/** Exportação estruturada legível por máquina — docs/SPEC.md §4.6. `version` permite evoluir o formato. */
export function toJson(a: ExportableAnalysis): string {
  return JSON.stringify(
    {
      version: 1,
      generator: "Harmonia",
      title: a.title,
      durationSec: a.durationSec,
      key: keyLabel(a),
      bpm: a.bpm,
      beatGrid: a.beatGrid,
      chords: a.chordSegments.map((c) => ({
        chord: c.chord,
        onset: c.onset,
        offset: c.offset,
        ...(c.confidence !== undefined ? { confidence: c.confidence } : {}),
      })),
    },
    null,
    2,
  );
}
