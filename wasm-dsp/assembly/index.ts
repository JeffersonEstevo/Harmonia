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
const MAX_FREQ_HZ: f64 = 2000.0; // acima disso é quase só harmônico/percussão em mixagens reais
const RELATIVE_SILENCE_FRACTION: f64 = 0.15; // frame precisa ter pelo menos 15% da energia do pico da faixa
const DOM7_PENALTY: f64 = 0.92; // pequeno viés contra 7ª — harmônicos reais tendem a inflar esse grau
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
// Análise por frame: chroma bruto/não-normalizado (12) + força de onset (1)
// + energia bruta do frame (1) = 14 floats/frame, empacotados num único
// Float32Array pra simplificar a fronteira JS<->WASM. O chroma é mantido
// SEM normalização de propósito — cosineSimilarity() já é invariante a
// escala, e manter a energia bruta é o que permite um gate de silêncio
// de verdade em classifyChords() (ver docs/DECISIONS.md).
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
  const out = new Float32Array(numFrames * 14);

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
        // compressão log — sem isso, um único transiente de percussão bem
        // forte (chute de bumbo, prato) domina o chroma do frame inteiro
        // e derruba a proporção real entre as notas do acorde
        chroma[pc] += Math.log(1.0 + mag);
      }
    }

    // energia BRUTA (pré-normalização) do frame — usada como gate de
    // silêncio/incerteza em classifyChords. Guardar isso é o que faltava
    // antes: normalizar aqui e só carregar o vetor já normalizado fazia
    // a "energia" somar sempre ~1.0, então o gate nunca disparava de
    // verdade (ver docs/DECISIONS.md).
    let rawEnergy: f64 = 0.0;
    for (let c = 0; c < 12; c++) rawEnergy += chroma[c];

    const outBase = frame * 14;
    for (let c = 0; c < 12; c++) out[outBase + c] = f32(chroma[c]);
    out[outBase + 12] = f32(flux);
    out[outBase + 13] = f32(rawEnergy);

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
    // fundamental e quinta são acusticamente mais robustas (reforçadas pelo
    // baixo, mais estáveis); a terça (e a sétima) definem a qualidade mas
    // são espectralmente mais "frágeis" — sem esse peso, acordes que
    // compartilham 2 de 3 notas com um vizinho (ex.: Sol maior e Si menor
    // compartilham Si e Ré) ficam ambíguos demais em áudio real.
    const offset = offsets[i];
    let weight: f64 = 1.0;
    if (offset == 0) weight = 1.3; // fundamental
    else if (offset == 7) weight = 1.15; // quinta justa
    t[pc] = weight;
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

  // primeira passada: acha a energia de pico da faixa, pra usar um gate de
  // silêncio RELATIVO (não um valor absoluto fixo, que varia demais entre
  // masterizações diferentes) — ver docs/DECISIONS.md.
  let maxEnergy: f64 = 0.0;
  for (let frame = 0; frame < numFrames; frame++) {
    const e = f64(framesData[frame * 14 + 13]);
    if (e > maxEnergy) maxEnergy = e;
  }
  const silenceFloor = maxEnergy * RELATIVE_SILENCE_FRACTION;

  for (let frame = 0; frame < numFrames; frame++) {
    const base = frame * 14;
    const energy = f64(framesData[base + 13]);

    if (energy < silenceFloor) {
      result[frame] = -1;
      continue;
    }

    for (let c = 0; c < 12; c++) chroma[c] = f64(framesData[base + c]);

    let bestId = -1;
    let bestScore: f64 = 0.0;
    for (let t = 0; t < 36; t++) {
      let score = cosineSimilarity(chroma, TEMPLATES[t]);
      // qualidade 2 = sétima dominante — harmônicos reais de instrumentos
      // acústicos/elétricos inflam naturalmente essa região do espectro,
      // então sem esse leve desconto o classificador vê "7ª" com frequência
      // muito maior do que realmente aparece em progressões comuns.
      if (t % 3 === 2) score *= DOM7_PENALTY;
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
    onset[i] = f64(framesData[i * 14 + 12]);
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
