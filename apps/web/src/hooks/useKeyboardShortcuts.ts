import { useEffect } from "react";
import { usePlayerStore } from "../stores/playerStore";

const SEEK_STEP_SECONDS = 5;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/**
 * Atalhos de teclado do transporte — ver docs/SPEC.md §4.1:
 * Space (play/pause), J/K/L (scrub, convenção de editor de vídeo: J/L pulam
 * ±5s, K é o mesmo que Space), I/O (define loop in/out no playhead atual),
 * +/- (zoom, via evento global consumido por WaveformCanvas).
 */
export function useKeyboardShortcuts(active: boolean): void {
  const playbackState = usePlayerStore((s) => s.playbackState);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const seek = usePlayerStore((s) => s.seek);
  const engine = usePlayerStore((s) => s.engine);
  const loopRegion = usePlayerStore((s) => s.loopRegion);
  const setLoopRegion = usePlayerStore((s) => s.setLoopRegion);

  useEffect(() => {
    if (!active) return;

    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          if (playbackState === "playing") pause();
          else play();
          break;

        case "j":
        case "J":
          e.preventDefault();
          seek(Math.max(0, engine.getCurrentTime() - SEEK_STEP_SECONDS));
          break;

        case "l":
        case "L":
          e.preventDefault();
          seek(Math.min(engine.duration, engine.getCurrentTime() + SEEK_STEP_SECONDS));
          break;

        case "i":
        case "I": {
          e.preventDefault();
          const now = engine.getCurrentTime();
          const end = loopRegion && loopRegion.end > now ? loopRegion.end : engine.duration;
          setLoopRegion({ start: now, end });
          break;
        }

        case "o":
        case "O": {
          e.preventDefault();
          const now = engine.getCurrentTime();
          const start = loopRegion && loopRegion.start < now ? loopRegion.start : 0;
          setLoopRegion({ start, end: now });
          break;
        }

        case "+":
        case "=":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("harmonia:zoom", { detail: { direction: 1 } }));
          break;

        case "-":
        case "_":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("harmonia:zoom", { detail: { direction: -1 } }));
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, playbackState, play, pause, seek, engine, loopRegion, setLoopRegion]);
}
