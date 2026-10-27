import type { PeakPyramid } from "../waveform/peaks";
import { getOverviewLevel } from "../waveform/peaks";

/**
 * Reduz a pirâmide de picos a `buckets` pares [min, max] intercalados —
 * o "envelope" da waveform usado nos exports e no link compartilhado.
 * Não permite reconstruir o áudio: só o contorno de amplitude.
 */
export function overviewPeaks(pyramid: PeakPyramid, buckets = 1000): number[] {
  const level = getOverviewLevel(pyramid);
  const available = level.data.length / 2;
  const out: number[] = new Array(buckets * 2);

  for (let b = 0; b < buckets; b++) {
    const from = Math.floor((b / buckets) * available);
    const to = Math.max(from + 1, Math.floor(((b + 1) / buckets) * available));

    let min = Infinity;
    let max = -Infinity;
    for (let i = from; i < Math.min(to, available); i++) {
      if (level.data[i * 2] < min) min = level.data[i * 2];
      if (level.data[i * 2 + 1] > max) max = level.data[i * 2 + 1];
    }
    if (min === Infinity) {
      min = 0;
      max = 0;
    }
    out[b * 2] = Math.round(min * 1000) / 1000;
    out[b * 2 + 1] = Math.round(max * 1000) / 1000;
  }
  return out;
}
