import { create } from "zustand";
import { AudioEngine, type PlaybackState, type LoopRegion } from "../lib/audio/AudioEngine";
import { buildPeakPyramid, type PeakPyramid } from "../lib/waveform/peaks";
import { validateAudioFile, validateDuration } from "../lib/validation/audioFile";
import { analyzeTrack, type ChordSegment } from "../lib/analysis/analysisClient";
import { analyzeTier2 } from "../lib/analysis/tier2Client";

/**
 * Estado GROSSO da faixa carregada — muda algumas vezes por sessão, não
 * 60x/segundo. currentTime de reprodução propositalmente NÃO mora aqui;
 * ver docs/SPEC.md §4.3 e o comentário em lib/audio/AudioEngine.ts.
 */
export type LoadStatus = "idle" | "validating" | "decoding" | "ready" | "error";
export type AnalysisStatus = "idle" | "analyzing" | "done" | "error";

/** Análise já persistida (vinda da biblioteca) — evita reanalisar ao reabrir */
export interface SavedAnalysis {
  chordSegments: ChordSegment[];
  bpm: number | null;
  beatGrid: number[];
  key: string | null;
  keyScale: string | null;
}

interface PlayerState {
  status: LoadStatus;
  fileName: string | null;
  duration: number;
  peaks: PeakPyramid | null;
  playbackState: PlaybackState;
  errorMessage: string | null;
  playbackRate: number;
  loopRegion: LoopRegion | null;
  loopEnabled: boolean;

  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  chordSegments: ChordSegment[];
  bpm: number | null;
  beatGrid: number[];

  tier2Status: AnalysisStatus;
  tier2Error: string | null;
  musicalKey: string | null;
  keyScale: string | null;

  followPlayhead: boolean;

  /** arquivo original carregado — necessário pra salvar na biblioteca */
  currentFile: File | null;
  /** id da faixa na biblioteca, se a faixa atual já foi salva/aberta de lá */
  savedTrackId: string | null;

  engine: AudioEngine;

  loadFile: (file: File) => Promise<void>;
  loadSavedTrack: (file: File, saved: SavedAnalysis, savedTrackId: string) => Promise<void>;
  markSaved: (savedTrackId: string) => void;
  reset: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  setLoopRegion: (region: LoopRegion | null) => void;
  toggleLoopEnabled: () => void;
  toggleFollowPlayhead: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const engine = new AudioEngine();
  engine.subscribe((playbackState) => set({ playbackState }));

  // contador de "geração" de carregamento — mais robusto que comparar por
  // fileName (que falha se a mesma faixa for carregada duas vezes seguidas).
  // Cada loadFile() captura seu próprio id; qualquer resposta de análise
  // (Nível 1 ou Camada 2) que chegar depois de um id mais novo já existir
  // é descartada, mesmo que o nome do arquivo seja idêntico.
  let loadGeneration = 0;

  return {
    status: "idle",
    fileName: null,
    duration: 0,
    peaks: null,
    playbackState: "idle",
    errorMessage: null,
    playbackRate: 1,
    loopRegion: null,
    loopEnabled: false,
    analysisStatus: "idle",
    analysisError: null,
    chordSegments: [],
    bpm: null,
    beatGrid: [],
    tier2Status: "idle",
    tier2Error: null,
    musicalKey: null,
    keyScale: null,
    followPlayhead: true,
    currentFile: null,
    savedTrackId: null,
    engine,

    async loadFile(file: File) {
      const myGeneration = ++loadGeneration;
      set({
        status: "validating",
        errorMessage: null,
        fileName: file.name,
        currentFile: file,
        savedTrackId: null,
        analysisStatus: "idle",
        analysisError: null,
        chordSegments: [],
        bpm: null,
        beatGrid: [],
        tier2Status: "idle",
        tier2Error: null,
        musicalKey: null,
        keyScale: null,
      });

      const validation = await validateAudioFile(file);
      if (!validation.ok) {
        set({ status: "error", errorMessage: validation.error.message });
        return;
      }

      set({ status: "decoding" });
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await engine.loadFromArrayBuffer(arrayBuffer);

        const durationError = validateDuration(audioBuffer.duration);
        if (durationError) {
          engine.dispose();
          set({ status: "error", errorMessage: durationError.message });
          return;
        }

        const channelData = audioBuffer.getChannelData(0);
        const peaks = buildPeakPyramid(channelData, audioBuffer.sampleRate);
        set({
          status: "ready",
          duration: audioBuffer.duration,
          peaks,
          loopRegion: null,
          loopEnabled: false,
          playbackRate: 1,
        });

        // análise Nível 1 roda em background (Web Worker) e popula
        // progressivamente — não bloqueia upload/waveform/reprodução,
        // ver docs/SPEC.md §2.1 "latência percebida baixa".
        set({ analysisStatus: "analyzing" });
        analyzeTrack(channelData, audioBuffer.sampleRate, audioBuffer.duration)
          .then((result) => {
            // guarda robusta contra resposta atrasada de uma faixa já trocada
            // (funciona mesmo se a mesma faixa for recarregada duas vezes)
            if (myGeneration !== loadGeneration) return;
            set({
              analysisStatus: "done",
              chordSegments: result.chordSegments,
              bpm: result.bpm,
              beatGrid: result.beatGrid,
            });
          })
          .catch((err) => {
            if (myGeneration !== loadGeneration) return;
            console.warn("[analysis] Nível 1 falhou:", err);
            set({ analysisStatus: "error", analysisError: err instanceof Error ? err.message : String(err) });
          });

        // Camada 2 (servidor) roda em paralelo — bem mais precisa (ver
        // docs/SPEC.md §4.4), substitui o resultado do Nível 1 quando
        // terminar. Falha aqui não é crítica: o Nível 1 já entregou algo.
        set({ tier2Status: "analyzing" });
        analyzeTier2(file)
          .then((result) => {
            if (myGeneration !== loadGeneration) return;
            set({
              tier2Status: "done",
              chordSegments: result.chordSegments,
              bpm: result.bpm ?? get().bpm,
              beatGrid: result.beatGrid.length > 0 ? result.beatGrid : get().beatGrid,
              musicalKey: result.key,
              keyScale: result.keyScale,
            });
          })
          .catch((err) => {
            if (myGeneration !== loadGeneration) return;
            console.warn("[analysis] Camada 2 indisponível:", err);
            set({ tier2Status: "error", tier2Error: err instanceof Error ? err.message : String(err) });
          });
      } catch {
        set({
          status: "error",
          errorMessage:
            "Não foi possível decodificar este arquivo — ele pode estar corrompido.",
        });
      }
    },

    play() {
      void get().engine.play();
    },
    pause() {
      get().engine.pause();
    },
    stop() {
      get().engine.stop();
    },
    seek(seconds: number) {
      get().engine.seek(seconds);
    },
    setPlaybackRate(rate: number) {
      void get().engine.setPlaybackRate(rate);
      set({ playbackRate: rate });
    },
    setLoopRegion(region: LoopRegion | null) {
      get().engine.setLoopRegion(region);
      set({ loopRegion: region, loopEnabled: region !== null });
    },
    toggleLoopEnabled() {
      const next = !get().loopEnabled;
      get().engine.setLoopEnabled(next);
      set({ loopEnabled: next });
    },

    toggleFollowPlayhead() {
      set({ followPlayhead: !get().followPlayhead });
    },

    /**
     * Reabre uma faixa da biblioteca: decodifica o áudio (necessário pra
     * waveform/reprodução) mas NÃO roda Nível 1 nem Camada 2 — a análise já
     * está salva, só hidrata o estado com ela.
     */
    async loadSavedTrack(file: File, saved: SavedAnalysis, savedTrackId: string) {
      const myGeneration = ++loadGeneration;
      set({
        status: "decoding",
        errorMessage: null,
        fileName: file.name,
        currentFile: file,
        savedTrackId,
        analysisStatus: "idle",
        analysisError: null,
        tier2Status: "idle",
        tier2Error: null,
        chordSegments: [],
        bpm: null,
        beatGrid: [],
        musicalKey: null,
        keyScale: null,
      });

      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await engine.loadFromArrayBuffer(arrayBuffer);
        if (myGeneration !== loadGeneration) return;

        const peaks = buildPeakPyramid(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
        set({
          status: "ready",
          duration: audioBuffer.duration,
          peaks,
          loopRegion: null,
          loopEnabled: false,
          playbackRate: 1,
          chordSegments: saved.chordSegments,
          bpm: saved.bpm,
          beatGrid: saved.beatGrid,
          musicalKey: saved.key,
          keyScale: saved.keyScale,
          // marcadas como concluídas: o resultado salvo veio da Camada 2
          analysisStatus: "done",
          tier2Status: "done",
        });
      } catch {
        set({
          status: "error",
          errorMessage: "Não foi possível abrir esta faixa salva — o áudio pode estar corrompido.",
        });
      }
    },

    markSaved(savedTrackId: string) {
      set({ savedTrackId });
    },

    reset() {
      // invalida qualquer resposta de análise ainda em voo da faixa anterior
      // (o AudioContext em si é reaproveitado — engine.stop() +
      // loadFromArrayBuffer() com um buffer novo já funciona sem recriar o
      // contexto, e recriar contexts de áudio sem necessidade é desperdício)
      loadGeneration++;
      get().engine.stop();
      set({
        status: "idle",
        fileName: null,
        duration: 0,
        peaks: null,
        errorMessage: null,
        playbackRate: 1,
        loopRegion: null,
        loopEnabled: false,
        analysisStatus: "idle",
        analysisError: null,
        chordSegments: [],
        bpm: null,
        beatGrid: [],
        tier2Status: "idle",
        tier2Error: null,
        musicalKey: null,
        keyScale: null,
        followPlayhead: true,
        currentFile: null,
        savedTrackId: null,
      });
    },
  };
});
