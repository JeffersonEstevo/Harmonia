import { usePlayerStore } from "../../stores/playerStore";
import { TimeReadout } from "./TimeReadout";
import "./TransportControls.css";

const RATE_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function TransportControls() {
  const playbackState = usePlayerStore((s) => s.playbackState);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const stop = usePlayerStore((s) => s.stop);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const loopRegion = usePlayerStore((s) => s.loopRegion);
  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const toggleLoopEnabled = usePlayerStore((s) => s.toggleLoopEnabled);
  const setLoopRegion = usePlayerStore((s) => s.setLoopRegion);

  const isPlaying = playbackState === "playing";

  return (
    <div className="transport">
      <div className="transport__row">
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

        <label className="transport__rate">
          <span>Velocidade</span>
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
          >
            {RATE_OPTIONS.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </label>

        <TimeReadout />
      </div>

      {loopRegion && (
        <div className="transport__row transport__row--loop">
          <button
            type="button"
            className={`transport__button transport__button--small ${
              loopEnabled ? "transport__button--active" : ""
            }`}
            onClick={toggleLoopEnabled}
            aria-pressed={loopEnabled}
          >
            {loopEnabled ? "Loop ligado" : "Loop desligado"}
          </button>
          <span className="transport__loop-range">
            {loopRegion.start.toFixed(2)}s – {loopRegion.end.toFixed(2)}s
          </span>
          <button
            type="button"
            className="transport__button transport__button--small"
            onClick={() => setLoopRegion(null)}
          >
            Limpar loop
          </button>
        </div>
      )}
    </div>
  );
}
