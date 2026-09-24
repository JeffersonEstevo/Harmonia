// Módulo WASM de DSP client-side — Nível 1 (rápido, sempre ativo).
// Ver docs/SPEC.md §4.4 e §6.2. Compilado via AssemblyScript (não Rust —
// ver docs/DECISIONS.md pelo motivo: sem toolchain Rust disponível no
// ambiente de build; AssemblyScript produz um .wasm real com a mesma
// API que um módulo Rust/C++ exporia, então a migração futura é possível
// sem mudar o contrato consumido pelo worker).
//
// Simplificação consciente (documentada em DECISIONS.md): usamos um
// chromagram baseado em FFT linear (mapeando bins de frequência pra classes
// de altura), não uma CQT logarítmica de verdade. É a abordagem clássica de
// detectores de acorde "leves" — suficiente pro Nível 1; a Camada 2
// (servidor, Fase 4) pode usar uma CQT real via librosa/essentia.

const TWO_PI: f64 = 6.283185307179586;
const MIN_FREQ_HZ: f64 = 80.0;
const MAX_FREQ_HZ: f64 = 5000.0;
const SILENCE_ENERGY_THRESHOLD: f64 = 0.02;
const CHORD_MATCH_THRESHOLD: f64 = 0.55;

// ---------------------------------------------------------------------------
// FFT — Cooley-Tukey radix-2, in-place, iterativo (frameSize deve ser potência de 2)
// ---------------------------------------------------------------------------

function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;

  // bit-reversal
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr;
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // butterflies
  for (let size = 2; size <= n; size <<= 1) {
    const halfSize = size >> 1;
    const angleStep = -TWO_PI / f64(size);
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < halfSize; k++) {
        const angle = angleStep * f64(k);
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const iA = start + k;
        const iB = start + k + halfSize;
        const br = real[iB] * wr - imag[iB] * wi;
        const bi = real[iB] * wi + imag[iB] * wr;
        real[iB] = real[iA] - br;
        imag[iB] = imag[iA] - bi;
        real[iA] = real[iA] + br;
        imag[iA] = imag[iA] + bi;
      }
    }
  }
}

function hannWindow(size: i32): Float64Array {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((TWO_PI * f64(i)) / f64(size - 1));
  }
  return w;
}

function freqToPitchClass(freqHz: f64): i32 {
  const midi = 69.0 + 12.0 * Math.log2(freqHz / 440.0);
  const rounded = i32(Math.round(midi));
  const pc = rounded % 12;
  return pc < 0 ? pc + 12 : pc;
}

// ---------------------------------------------------------------------------
// Análise por frame: chroma (12) + força de onset (1) = 13 floats/frame,
// empacotados num único Float32Array pra simplificar a fronteira JS<->WASM.
// ---------------------------------------------------------------------------

export function analyzeFrames(
  samples: Float32Array,
  sampleRate: i32,
  frameSize: i32,
  hopSize: i32,
): Float32Array {
  const n = samples.length;
  const numFrames = n > frameSize ? 1 + (n - frameSize) / hopSize : 1;
  const window = hannWindow(frameSize);
  const out = new Float32Array(numFrames * 13);

  const real = new Float64Array(frameSize);
  const imag = new Float64Array(frameSize);
  const prevMagnitude = new Float64Array(frameSize / 2);
  const magnitude = new Float64Array(frameSize / 2);

  const binHz = f64(sampleRate) / f64(frameSize);

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopSize;

    for (let i = 0; i < frameSize; i++) {
      const sampleIdx = start + i;
      const s: f64 = sampleIdx < n ? f64(samples[sampleIdx]) : 0.0;
      real[i] = s * window[i];
      imag[i] = 0.0;
    }

    fft(real, imag);

    const chroma = new Float64Array(12);
    let flux: f64 = 0.0;

    for (let k = 1; k < frameSize / 2; k++) {
      const mag = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
      magnitude[k] = mag;

      const diff = mag - prevMagnitude[k];
      if (diff > 0.0) flux += diff;

      const freqHz = f64(k) * binHz;
      if (freqHz >= MIN_FREQ_HZ && freqHz <= MAX_FREQ_HZ) {
        const pc = freqToPitchClass(freqHz);
        chroma[pc] += mag;
      }
    }

    // normaliza o vetor de chroma do frame (deixa a classificação de acorde
    // invariante a volume) — por soma, não por máximo, fica menos sensível
    // a um único bin espúrio dominando.
    let chromaSum: f64 = 0.0;
    for (let c = 0; c < 12; c++) chromaSum += chroma[c];
    if (chromaSum > 0.0) {
      for (let c = 0; c < 12; c++) chroma[c] = chroma[c] / chromaSum;
    }

    const outBase = frame * 13;
    for (let c = 0; c < 12; c++) out[outBase + c] = f32(chroma[c]);
    out[outBase + 12] = f32(flux);

    for (let k = 0; k < frameSize / 2; k++) prevMagnitude[k] = magnitude[k];
  }

  return out;
}

// ---------------------------------------------------------------------------
// Classificação de acordes — template matching por similaridade de cosseno
// contra 36 templates (12 fundamentais x {maior, menor, sétima dominante}).
// Retorna, por frame: id 0-35 (root*3 + qualidade) ou -1 (sem acorde/silêncio).
// ---------------------------------------------------------------------------

function buildTemplates(): StaticArray<Float64Array> {
  // offsets em semitons a partir da fundamental
  const majorOffsets = [0, 4, 7];
  const minorOffsets = [0, 3, 7];
  const dom7Offsets = [0, 4, 7, 10];

  const templates = new StaticArray<Float64Array>(36);
  for (let root = 0; root < 12; root++) {
    templates[root * 3 + 0] = buildTemplate(root, majorOffsets);
    templates[root * 3 + 1] = buildTemplate(root, minorOffsets);
    templates[root * 3 + 2] = buildTemplate(root, dom7Offsets);
  }
  return templates;
}

function buildTemplate(root: i32, offsets: i32[]): Float64Array {
  const t = new Float64Array(12);
  for (let i = 0; i < offsets.length; i++) {
    const pc = (root + offsets[i]) % 12;
    t[pc] = 1.0;
  }
  return t;
}

const TEMPLATES = buildTemplates();

function cosineSimilarity(a: Float64Array, b: Float64Array): f64 {
  let dot: f64 = 0.0;
  let normA: f64 = 0.0;
  let normB: f64 = 0.0;
  for (let i = 0; i < 12; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA <= 0.0 || normB <= 0.0) return 0.0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function classifyChords(framesData: Float32Array, numFrames: i32): Int32Array {
  const result = new Int32Array(numFrames);
  const chroma = new Float64Array(12);

  for (let frame = 0; frame < numFrames; frame++) {
    const base = frame * 13;
    let energy: f64 = 0.0;
    for (let c = 0; c < 12; c++) {
      chroma[c] = f64(framesData[base + c]);
      energy += chroma[c];
    }

    if (energy < SILENCE_ENERGY_THRESHOLD) {
      result[frame] = -1;
      continue;
    }

    let bestId = -1;
    let bestScore: f64 = 0.0;
    for (let t = 0; t < 36; t++) {
      const score = cosineSimilarity(chroma, TEMPLATES[t]);
      if (score > bestScore) {
        bestScore = score;
        bestId = t;
      }
    }

    result[frame] = bestScore >= CHORD_MATCH_THRESHOLD ? bestId : -1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tempo (BPM) — autocorrelação do envelope de força de onset.
// ---------------------------------------------------------------------------

export function estimateTempo(
  framesData: Float32Array,
  numFrames: i32,
  hopSize: i32,
  sampleRate: i32,
  minBpm: f32,
  maxBpm: f32,
): f32 {
  if (numFrames < 8) return 0.0;

  const onset = new Float64Array(numFrames);
  let mean: f64 = 0.0;
  for (let i = 0; i < numFrames; i++) {
    onset[i] = f64(framesData[i * 13 + 12]);
    mean += onset[i];
  }
  mean /= f64(numFrames);
  for (let i = 0; i < numFrames; i++) onset[i] -= mean;

  const framesPerSecond = f64(sampleRate) / f64(hopSize);
  const minLag = i32(Math.max(1.0, Math.floor((60.0 / f64(maxBpm)) * framesPerSecond)));
  const maxLag = i32(Math.min(f64(numFrames - 1), Math.ceil((60.0 / f64(minBpm)) * framesPerSecond)));

  let bestLag = minLag;
  let bestScore: f64 = -1.0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let score: f64 = 0.0;
    const limit = numFrames - lag;
    for (let i = 0; i < limit; i++) {
      score += onset[i] * onset[i + lag];
    }
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  if (bestLag <= 0) return 0.0;
  const bpm = 60.0 * framesPerSecond / f64(bestLag);
  return f32(bpm);
}
