import { create } from "zustand";
import { AudioEngine, type PlaybackState, type LoopRegion } from "../lib/audio/AudioEngine";
import { buildPeakPyramid, type PeakPyramid } from "../lib/waveform/peaks";
import { validateAudioFile, validateDuration } from "../lib/validation/audioFile";

/**
 * Estado GROSSO da faixa carregada — muda algumas vezes por sessão, não
 * 60x/segundo. currentTime de reprodução propositalmente NÃO mora aqui;
 * ver docs/SPEC.md §4.3 e o comentário em lib/audio/AudioEngine.ts.
 */
export type LoadStatus = "idle" | "validating" | "decoding" | "ready" | "error";

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

  engine: AudioEngine;

  loadFile: (file: File) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  setLoopRegion: (region: LoopRegion | null) => void;
  toggleLoopEnabled: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const engine = new AudioEngine();
  engine.subscribe((playbackState) => set({ playbackState }));

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
    engine,

    async loadFile(file: File) {
      set({ status: "validating", errorMessage: null, fileName: file.name });

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

        const peaks = buildPeakPyramid(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
        set({
          status: "ready",
          duration: audioBuffer.duration,
          peaks,
          loopRegion: null,
          loopEnabled: false,
          playbackRate: 1,
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
  };
});
