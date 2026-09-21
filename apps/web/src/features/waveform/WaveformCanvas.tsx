import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../../stores/playerStore";
import { pickLevelForZoom, type PeakPyramid } from "../../lib/waveform/peaks";
import { useAnimationFrame } from "../../hooks/useAnimationFrame";
import { WaveformMinimap } from "./WaveformMinimap";
import "./WaveformCanvas.css";

interface ViewWindow {
  start: number;
  end: number;
}

const MIN_VISIBLE_SAMPLES = 2_000; // trava de zoom máximo
const EDGE_GRAB_PX = 8; // distância em pixels pra "agarrar" a borda do loop

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  widthCss: number,
  heightCss: number,
  pyramid: PeakPyramid,
  view: ViewWindow,
  playheadSample: number | null,
  loopSamples: { start: number; end: number } | null,
) {
  ctx.clearRect(0, 0, widthCss, heightCss);

  const level = pickLevelForZoom(pyramid, view.end - view.start, widthCss);
  const midY = heightCss / 2;
  const scaleY = heightCss / 2;
  const samplesPerPixel = (view.end - view.start) / widthCss;

  // região de loop, desenhada ANTES da waveform (fica "atrás")
  if (loopSamples) {
    const x1 = (loopSamples.start - view.start) / samplesPerPixel;
    const x2 = (loopSamples.end - view.start) / samplesPerPixel;
    ctx.fillStyle = "rgba(226, 166, 61, 0.12)";
    ctx.fillRect(x1, 0, x2 - x1, heightCss);
    ctx.strokeStyle = "rgba(226, 166, 61, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1 + 0.5, 0);
    ctx.lineTo(x1 + 0.5, heightCss);
    ctx.moveTo(x2 + 0.5, 0);
    ctx.lineTo(x2 + 0.5, heightCss);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(237, 237, 240, 0.65)";
  const firstBucket = Math.floor(view.start / level.samplesPerPeak);
  const lastBucket = Math.ceil(view.end / level.samplesPerPeak);

  for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
    if (bucket < 0 || bucket * 2 + 1 >= level.data.length) continue;
    const bucketStartSample = bucket * level.samplesPerPeak;
    const x = (bucketStartSample - view.start) / samplesPerPixel;
    if (x < -4 || x > widthCss + 4) continue;

    const min = level.data[bucket * 2];
    const max = level.data[bucket * 2 + 1];
    const yTop = midY - max * scaleY;
    const yBottom = midY - min * scaleY;
    ctx.fillRect(x, yTop, Math.max(1, 1 / samplesPerPixel), Math.max(1, yBottom - yTop));
  }

  ctx.strokeStyle = "rgba(237, 237, 240, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(widthCss, midY);
  ctx.stroke();

  if (playheadSample !== null && playheadSample >= view.start && playheadSample <= view.end) {
    const x = (playheadSample - view.start) / samplesPerPixel;
    ctx.strokeStyle = "#e2a63d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, heightCss);
    ctx.stroke();
  }
}

type DragMode =
  | { kind: "scrub" }
  | { kind: "create-loop"; anchorSample: number }
  | { kind: "resize-loop"; edge: "start" | "end" };

export function WaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewWindow>({ start: 0, end: 0 });
  const dragModeRef = useRef<DragMode | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartViewRef = useRef<ViewWindow | null>(null);

  const peaks = usePlayerStore((s) => s.peaks);
  const engine = usePlayerStore((s) => s.engine);
  const seek = usePlayerStore((s) => s.seek);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const loopRegion = usePlayerStore((s) => s.loopRegion);
  const setLoopRegion = usePlayerStore((s) => s.setLoopRegion);

  const [view, setView] = useState<ViewWindow>({ start: 0, end: 0 });

  useEffect(() => {
    if (peaks) setView({ start: 0, end: peaks.totalSamples });
  }, [peaks]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const applyZoom = (factor: number, centerSample?: number) => {
    if (!peaks) return;
    const { start, end } = viewRef.current;
    const span = end - start;
    const center = centerSample ?? (start + end) / 2;
    const ratio = (center - start) / span;

    const newSpan = Math.max(MIN_VISIBLE_SAMPLES, Math.min(span * factor, peaks.totalSamples));
    let newStart = center - ratio * newSpan;
    let newEnd = newStart + newSpan;
    if (newStart < 0) {
      newEnd -= newStart;
      newStart = 0;
    }
    if (newEnd > peaks.totalSamples) {
      newStart -= newEnd - peaks.totalSamples;
      newEnd = peaks.totalSamples;
    }
    setView({ start: Math.max(0, newStart), end: newEnd });
  };

  // atalhos de teclado (+/-) disparam um evento global — ver hooks/useKeyboardShortcuts.ts
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ direction: 1 | -1 }>).detail;
      applyZoom(detail.direction > 0 ? 1 / 1.4 : 1.4);
    };
    window.addEventListener("harmonia:zoom", handler);
    return () => window.removeEventListener("harmonia:zoom", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks]);

  const sampleAtClientX = (clientX: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return null;
    const rect = canvas.getBoundingClientRect();
    const xRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const { start, end } = viewRef.current;
    return start + xRatio * (end - start);
  };

  const secondsToSamples = (s: number) => s * (peaks?.sampleRate ?? 44_100);
  const samplesToSeconds = (s: number) => s / (peaks?.sampleRate ?? 44_100);

  const loopSamples =
    loopRegion && peaks
      ? { start: secondsToSamples(loopRegion.start), end: secondsToSamples(loopRegion.end) }
      : null;

  const edgeNear = (sample: number): "start" | "end" | null => {
    if (!loopSamples || !peaks) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const samplesPerPixel = (viewRef.current.end - viewRef.current.start) / rect.width;
    const pxDistStart = Math.abs(sample - loopSamples.start) / samplesPerPixel;
    const pxDistEnd = Math.abs(sample - loopSamples.end) / samplesPerPixel;
    if (pxDistStart < EDGE_GRAB_PX && pxDistStart <= pxDistEnd) return "start";
    if (pxDistEnd < EDGE_GRAB_PX) return "end";
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!peaks) return;
    const sample = sampleAtClientX(e.clientX);
    if (sample === null) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

    const edge = edgeNear(sample);
    if (edge) {
      dragModeRef.current = { kind: "resize-loop", edge };
      return;
    }

    if (e.shiftKey) {
      dragModeRef.current = { kind: "create-loop", anchorSample: sample };
      setLoopRegion({ start: samplesToSeconds(sample), end: samplesToSeconds(sample) });
      return;
    }

    dragModeRef.current = { kind: "scrub" };
    seek(samplesToSeconds(sample));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = dragModeRef.current;
    if (!mode || !peaks) return;
    const sample = sampleAtClientX(e.clientX);
    if (sample === null) return;
    const clamped = Math.max(0, Math.min(sample, peaks.totalSamples));

    if (mode.kind === "scrub") {
      seek(samplesToSeconds(clamped));
      return;
    }

    if (mode.kind === "create-loop") {
      const start = Math.min(mode.anchorSample, clamped);
      const end = Math.max(mode.anchorSample, clamped);
      setLoopRegion({ start: samplesToSeconds(start), end: samplesToSeconds(end) });
      return;
    }

    if (mode.kind === "resize-loop" && loopRegion) {
      const currentStart = secondsToSamples(loopRegion.start);
      const currentEnd = secondsToSamples(loopRegion.end);
      if (mode.edge === "start") {
        setLoopRegion({
          start: samplesToSeconds(Math.min(clamped, currentEnd - 1)),
          end: loopRegion.end,
        });
      } else {
        setLoopRegion({
          start: loopRegion.start,
          end: samplesToSeconds(Math.max(clamped, currentStart + 1)),
        });
      }
    }
  };

  const handlePointerUp = () => {
    // loop degenerado (arrasto minúsculo/acidental) — descarta
    if (dragModeRef.current?.kind === "create-loop" && loopRegion) {
      if (loopRegion.end - loopRegion.start < 0.05) setLoopRegion(null);
    }
    dragModeRef.current = null;
  };

  const handleDoubleClick = () => {
    if (loopRegion) setLoopRegion(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!peaks) return;
    e.preventDefault();
    const cursorSample = sampleAtClientX(e.clientX);
    applyZoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, cursorSample ?? undefined);
  };

  // pinch-to-zoom por toque — Pointer Events não cobrem multi-touch de forma
  // simples entre navegadores, então usamos Touch Events nativos aqui.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const distance = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStartDistRef.current = distance(e.touches);
        pinchStartViewRef.current = viewRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDistRef.current && pinchStartViewRef.current && peaks) {
        e.preventDefault();
        const newDist = distance(e.touches);
        const factor = pinchStartDistRef.current / newDist; // pinça pra fora => diminui span
        const startView = pinchStartViewRef.current;
        const span = startView.end - startView.start;
        const center = (startView.start + startView.end) / 2;

        // calcula a partir do span ORIGINAL do gesto (não do view atual), pra não
        // acumular zoom a cada evento de touchmove
        const newSpan = Math.max(MIN_VISIBLE_SAMPLES, Math.min(span * factor, peaks.totalSamples));
        let newStart = center - newSpan / 2;
        let newEnd = newStart + newSpan;
        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd > peaks.totalSamples) {
          newStart -= newEnd - peaks.totalSamples;
          newEnd = peaks.totalSamples;
        }
        setView({ start: Math.max(0, newStart), end: newEnd });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartDistRef.current = null;
        pinchStartViewRef.current = null;
      }
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [peaks]);

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !peaks) return;

    const dpr = window.devicePixelRatio || 1;
    const widthCss = container.clientWidth;
    const heightCss = container.clientHeight;

    if (canvas.width !== widthCss * dpr || canvas.height !== heightCss * dpr) {
      canvas.width = widthCss * dpr;
      canvas.height = heightCss * dpr;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const playheadSample = engine.getCurrentTime() * peaks.sampleRate;
    drawWaveform(ctx, widthCss, heightCss, peaks, viewRef.current, playheadSample, loopSamples);
  }, Boolean(peaks));

  if (!peaks) return null;

  return (
    <div className="waveform-stage">
      <div ref={containerRef} className="waveform">
        <canvas
          ref={canvasRef}
          className="waveform__canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
          aria-label={`Waveform do áudio, reprodução ${playbackState}. Shift+arraste para criar um loop, duplo clique para limpar.`}
        />
      </div>
      <WaveformMinimap peaks={peaks} view={view} onViewChange={setView} />
    </div>
  );
}
