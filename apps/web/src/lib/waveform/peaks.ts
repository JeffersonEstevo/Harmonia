/**
 * Pirâmide de picos min/max multi-resolução — ver docs/SPEC.md §4.3.
 * Calculada uma vez, no client, a partir dos dados decodificados; permite
 * zoom de "música inteira" até "batida única" sem jamais re-decodificar
 * o áudio nem redesenhar a partir da waveform bruta a cada frame.
 *
 * Função pura (recebe Float32Array, não AudioBuffer) para ser testável
 * sem precisar de um AudioContext real.
 */

export interface PeakLevel {
  /** amostras por "bucket" de pico neste nível — quanto maior, mais zoom out */
  samplesPerPeak: number;
  /** pares [min, max] por bucket, já intercalados: [min0, max0, min1, max1, ...] */
  data: Float32Array;
}

export interface PeakPyramid {
  levels: PeakLevel[];
  totalSamples: number;
  sampleRate: number;
}

const BASE_SAMPLES_PER_PEAK = 256;
const LEVEL_MULTIPLIER = 8;
const MAX_LEVELS = 6;

function computeLevel(channelData: Float32Array, samplesPerPeak: number): PeakLevel {
  const bucketCount = Math.ceil(channelData.length / samplesPerPeak);
  const data = new Float32Array(bucketCount * 2);

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = bucket * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, channelData.length);

    let min = Infinity;
    let max = -Infinity;
    for (let i = start; i < end; i++) {
      const v = channelData[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    data[bucket * 2] = min === Infinity ? 0 : min;
    data[bucket * 2 + 1] = max === -Infinity ? 0 : max;
  }

  return { samplesPerPeak, data };
}

/**
 * Constrói a pirâmide a partir de um único canal (canal 0, ou a mixagem
 * mono já feita pelo caller). Cada nível é ~8x mais "grosso" que o
 * anterior, então o consumidor escolhe o nível mais fino que ainda renderiza
 * menos de ~2 picos por pixel de tela, evitando desenhar detalhe inútil.
 */
export function buildPeakPyramid(
  channelData: Float32Array,
  sampleRate: number,
): PeakPyramid {
  const levels: PeakLevel[] = [];
  let samplesPerPeak = BASE_SAMPLES_PER_PEAK;

  for (let i = 0; i < MAX_LEVELS; i++) {
    levels.push(computeLevel(channelData, samplesPerPeak));
    if (samplesPerPeak * LEVEL_MULTIPLIER > channelData.length) break;
    samplesPerPeak *= LEVEL_MULTIPLIER;
  }

  return { levels, totalSamples: channelData.length, sampleRate };
}

/** Escolhe o nível mais detalhado que ainda cabe em `targetPeakCount` picos. */
export function pickLevelForZoom(
  pyramid: PeakPyramid,
  visibleSamples: number,
  targetPeakCount: number,
): PeakLevel {
  const idealSamplesPerPeak = visibleSamples / targetPeakCount;

  let chosen = pyramid.levels[pyramid.levels.length - 1];
  for (const level of pyramid.levels) {
    if (level.samplesPerPeak >= idealSamplesPerPeak) {
      chosen = level;
      break;
    }
  }
  return chosen;
}
