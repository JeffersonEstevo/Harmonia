import { useEffect, useRef } from "react";

/**
 * Roda `callback` a cada frame enquanto `active` for true, sem nunca causar
 * re-render por conta própria — quem chama decide se/quando atualizar estado
 * do React. É o que permite ao playhead da waveform (e a qualquer outro
 * "assinante" do relógio de transporte) redesenhar a 60fps sem re-renderizar
 * a árvore de componentes inteira. Ver docs/SPEC.md §4.3.
 */
export function useAnimationFrame(callback: (deltaMs: number) => void, active: boolean): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!active) return;

    let frameId: number;
    let lastTime = performance.now();

    const tick = (time: number) => {
      callbackRef.current(time - lastTime);
      lastTime = time;
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active]);
}
