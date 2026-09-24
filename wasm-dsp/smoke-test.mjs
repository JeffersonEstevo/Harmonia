// Teste manual de sanidade da DSP com áudio sintético — não é um teste
// automatizado no CI (fica fora do `npm test` do monorepo por ora, já que
// jsdom não roda WASM/áudio real do mesmo jeito que o navegador), mas
// valida a matemática do zero antes de integrar com a UI.
import * as dsp from "./build/chord-dsp.js";

const SAMPLE_RATE = 44100;
const FRAME_SIZE = 4096;
const HOP_SIZE = 2048;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const QUALITY_NAMES = ["", "m", "7"];

function sineWave(freqHz, seconds, amplitude = 0.5) {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    data[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / SAMPLE_RATE);
  }
  return data;
}

function chordWave(freqsHz, seconds) {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const data = new Float32Array(n);
  for (const freq of freqsHz) {
    for (let i = 0; i < n; i++) {
      data[i] += (0.3 / freqsHz.length) * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
    }
  }
  return data;
}

function noteFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "OK  " : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

// --- Teste 1: uma senoide pura de 440Hz (A4) deve dar pico de chroma em "A" (pitch class 9)
{
  const samples = sineWave(440, 2);
  const frames = dsp.analyzeFrames(samples, SAMPLE_RATE, FRAME_SIZE, HOP_SIZE);
  const numFrames = frames.length / 13;
  const midFrame = Math.floor(numFrames / 2);
  const chroma = Array.from(frames.slice(midFrame * 13, midFrame * 13 + 12));
  const peakPc = chroma.indexOf(Math.max(...chroma));
  check(`440Hz (A4) -> pico de chroma em A (pc=9), obtido pc=${peakPc} (${NOTE_NAMES[peakPc]})`, peakPc === 9);
}

// --- Teste 2: acorde de Dó maior (C-E-G) deve ser classificado como "C" (id=0)
{
  const cMaj = chordWave([noteFreq(60), noteFreq(64), noteFreq(67)], 2); // C4 E4 G4
  const frames = dsp.analyzeFrames(cMaj, SAMPLE_RATE, FRAME_SIZE, HOP_SIZE);
  const numFrames = frames.length / 13;
  const chordIds = dsp.classifyChords(frames, numFrames);
  const midId = chordIds[Math.floor(numFrames / 2)];
  const label = midId >= 0 ? `${NOTE_NAMES[Math.floor(midId / 3)]}${QUALITY_NAMES[midId % 3]}` : "N";
  check(`Acorde C-E-G -> classificado como "C" maior, obtido "${label}" (id=${midId})`, midId === 0);
}

// --- Teste 3: acorde de Lá menor (A-C-E) deve ser classificado como "Am" (id = 9*3+1 = 28)
{
  const aMin = chordWave([noteFreq(57), noteFreq(60), noteFreq(64)], 2); // A3 C4 E4
  const frames = dsp.analyzeFrames(aMin, SAMPLE_RATE, FRAME_SIZE, HOP_SIZE);
  const numFrames = frames.length / 13;
  const chordIds = dsp.classifyChords(frames, numFrames);
  const midId = chordIds[Math.floor(numFrames / 2)];
  const label = midId >= 0 ? `${NOTE_NAMES[Math.floor(midId / 3)]}${QUALITY_NAMES[midId % 3]}` : "N";
  check(`Acorde A-C-E -> classificado como "Am", obtido "${label}" (id=${midId})`, midId === 28);
}

// --- Teste 4: silêncio não deve ser classificado como acorde nenhum (-1)
{
  const silence = new Float32Array(SAMPLE_RATE * 1);
  const frames = dsp.analyzeFrames(silence, SAMPLE_RATE, FRAME_SIZE, HOP_SIZE);
  const numFrames = frames.length / 13;
  const chordIds = dsp.classifyChords(frames, numFrames);
  const allSilence = Array.from(chordIds).every((id) => id === -1);
  check("Silêncio -> nenhum acorde detectado (-1) em todos os frames", allSilence);
}

// --- Teste 5: clique metronômico a 120 BPM deve estimar tempo perto de 120
{
  const bpm = 120;
  const beatIntervalSec = 60 / bpm;
  const totalSec = 8;
  const n = Math.floor(SAMPLE_RATE * totalSec);
  const samples = new Float32Array(n);
  for (let t = 0; t < totalSec; t += beatIntervalSec) {
    const clickStart = Math.floor(t * SAMPLE_RATE);
    for (let i = 0; i < 400 && clickStart + i < n; i++) {
      samples[clickStart + i] = 0.9 * Math.exp(-i / 60) * Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE);
    }
  }
  const frames = dsp.analyzeFrames(samples, SAMPLE_RATE, FRAME_SIZE, HOP_SIZE);
  const numFrames = frames.length / 13;
  const estimatedBpm = dsp.estimateTempo(frames, numFrames, HOP_SIZE, SAMPLE_RATE, 60, 200);
  const withinTolerance = Math.abs(estimatedBpm - bpm) < 5 || Math.abs(estimatedBpm - bpm * 2) < 5 || Math.abs(estimatedBpm - bpm / 2) < 5;
  check(`Cliques a 120 BPM -> tempo estimado ~120 (ou múltiplo/submúltiplo octave-equivalente), obtido ${estimatedBpm.toFixed(1)}`, withinTolerance);
}

console.log(`\n${failures === 0 ? "Todos os testes passaram." : `${failures} teste(s) falharam.`}`);
process.exit(failures === 0 ? 0 : 1);
