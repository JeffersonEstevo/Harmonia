/**
 * Web Worker da análise Nível 1 — roda o módulo WASM (FFT/chroma/onset/
 * classificação de acordes/tempo) fora da thread principal. Ver
 * docs/SPEC.md §6.2 "Módulo WASM... invocado via Web Worker".
 *
 * Faz também o pós-processamento (suavização + codificação em segmentos)
 * em JS puro aqui mesmo — não precisa estar dentro do WASM, é barato.
 *
 * O import do módulo WASM é DINÂMICO (dentro do onmessage, não um
 * `import` estático no topo do arquivo) de propósito: se o carregamento
 * do .wasm falhar por qualquer motivo (MIME type errado no servidor,
 * 404, etc.), um import estático mataria a avaliação do worker inteiro
 * SEM disparar erro nenhum visível — o worker nunca chegaria a registrar
 * `self.onmessage`, e a Promise do lado do cliente ficaria pendurada pra
 * sempre. Com import dinâmico dentro de um try/catch, a falha vira uma
 * mensagem de erro de verdade, reportada de volta ao cliente.
 */

const FRAME_SIZE = 4096;
const HOP_SIZE = 2048;
const MIN_BPM = 60;
const MAX_BPM = 200;
const MIN_SEGMENT_SECONDS = 0.35; // funde segmentos mais curtos que isso (evita flicker frame-a-frame)

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const QUALITY_SUFFIX = ["", "m", "7"];

function chordIdToSymbol(id) {
  if (id < 0) return null;
  const root = Math.floor(id / 3);
  const quality = id % 3;
  return `${NOTE_NAMES[root]}${QUALITY_SUFFIX[quality]}`;
}

/** Roda um filtro de moda (valor mais frequente) numa janela deslizante pra
 * suavizar flicker frame-a-frame antes de codificar em segmentos — um
 * substituto simples do HMM/CRF que a Camada 2 (servidor) fará de verdade. */
function smoothChordIds(ids, windowSize) {
  const half = Math.floor(windowSize / 2);
  const smoothed = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    const counts = new Map();
    for (let j = Math.max(0, i - half); j <= Math.min(ids.length - 1, i + half); j++) {
      const id = ids[j];
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    let bestId = ids[i];
    let bestCount = -1;
    for (const [id, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        bestId = id;
      }
    }
    smoothed[i] = bestId;
  }
  return smoothed;
}

function encodeSegments(ids, hopSize, sampleRate, minSegmentSeconds) {
  const segments = [];
  let i = 0;
  while (i < ids.length) {
    const id = ids[i];
    let j = i + 1;
    while (j < ids.length && ids[j] === id) j++;

    const onset = (i * hopSize) / sampleRate;
    const offset = (j * hopSize) / sampleRate;
    segments.push({ id, onset, offset });
    i = j;
  }

  // funde segmentos curtos demais no vizinho anterior (ou remove se for o primeiro)
  const merged = [];
  for (const seg of segments) {
    if (seg.offset - seg.onset < minSegmentSeconds && merged.length > 0) {
      merged[merged.length - 1].offset = seg.offset;
    } else {
      merged.push(seg);
    }
  }

  return merged
    .filter((seg) => seg.id >= 0)
    .map((seg) => ({
      chord: chordIdToSymbol(seg.id),
      onset: seg.onset,
      offset: seg.offset,
    }));
}

function buildBeatGrid(bpm, durationSeconds) {
  if (!bpm || bpm <= 0) return [];
  const interval = 60 / bpm;
  const beats = [];
  for (let t = 0; t < durationSeconds; t += interval) beats.push(t);
  return beats;
}

self.onmessage = async (event) => {
  const { channelData, sampleRate, durationSeconds } = event.data;

  try {
    const dsp = await import("../wasm/chord-dsp.js");

    const frames = dsp.analyzeFrames(channelData, sampleRate, FRAME_SIZE, HOP_SIZE);
    const numFrames = frames.length / 13;

    const rawChordIds = Array.from(dsp.classifyChords(frames, numFrames));
    const smoothedIds = smoothChordIds(rawChordIds, 9);
    const chordSegments = encodeSegments(smoothedIds, HOP_SIZE, sampleRate, MIN_SEGMENT_SECONDS);

    const bpm = dsp.estimateTempo(frames, numFrames, HOP_SIZE, sampleRate, MIN_BPM, MAX_BPM);
    const beatGrid = buildBeatGrid(bpm, durationSeconds);

    self.postMessage({
      type: "result",
      chordSegments,
      bpm: bpm > 0 ? Math.round(bpm * 10) / 10 : null,
      beatGrid,
    });
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
