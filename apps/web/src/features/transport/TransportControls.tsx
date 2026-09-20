import { usePlayerStore } from "../../stores/playerStore";
import { TimeReadout } from "./TimeReadout";
import "./TransportControls.css";

export function TransportControls() {
  const playbackState = usePlayerStore((s) => s.playbackState);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const stop = usePlayerStore((s) => s.stop);

  const isPlaying = playbackState === "playing";

  return (
    <div className="transport">
      <button
        type="button"
        className="transport__button transport__button--primary"
        onClick={() => (isPlaying ? pause() : play())}
        aria-label={isPlaying ? "Pausar" : "Reproduzir"}
      >
        {isPlaying ? "Pausar" : "Reproduzir"}
      </button>

      <button type="button" className="transport__button" onClick={stop} aria-label="Parar">
        Parar
      </button>

      <TimeReadout />
    </div>
  );
}
