import { useRef, useState } from "react";
import { usePlayerStore } from "../../stores/playerStore";
import { useAnimationFrame } from "../../hooks/useAnimationFrame";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Isolado em componente próprio de propósito: é o único lugar do app que
 * re-renderiza no ritmo da reprodução (a cada segundo cheio, não a cada
 * frame — não precisamos de mais que isso para um texto de tempo).
 * O playhead visual na waveform, que SIM precisa de 60fps, é desenhado
 * direto no canvas sem passar por estado do React (ver WaveformCanvas.tsx).
 */
export function TimeReadout() {
  const engine = usePlayerStore((s) => s.engine);
  const duration = usePlayerStore((s) => s.duration);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const [displaySecond, setDisplaySecond] = useState(0);
  const lastSecondRef = useRef(-1);

  useAnimationFrame(() => {
    const current = Math.floor(engine.getCurrentTime());
    if (current !== lastSecondRef.current) {
      lastSecondRef.current = current;
      setDisplaySecond(current);
    }
  }, playbackState === "playing");

  const time = playbackState === "playing" ? displaySecond : engine.getCurrentTime();

  return (
    <span className="time-readout">
      {formatTime(time)} <span className="time-readout__sep">/</span> {formatTime(duration)}
    </span>
  );
}
