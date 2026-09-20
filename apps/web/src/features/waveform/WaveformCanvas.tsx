import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../../stores/playerStore";
import { pickLevelForZoom, type PeakPyramid } from "../../lib/waveform/peaks";
import { useAnimationFrame } from "../../hooks/useAnimationFrame";
import "./WaveformCanvas.css";

interface ViewWindow {
  /** amostra inicial/final visíveis, no canal decodificado original */
  start: number;
  end: number;
}

const MIN_VISIBLE_SAMPLES = 2_000; // trava de zoom máximo (evita "zoom infinito")

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  widthCss: number,
  heightCss: number,
  pyramid: PeakPyramid,
  view: ViewWindow,
  playheadSample: number | null,
) {
  ctx.clearRect(0, 0, widthCss, heightCss);

  const level = pickLevelForZoom(pyramid, view.end - view.start, widthCss);
  const midY = heightCss / 2;
  const scaleY = heightCss / 2;

  ctx.fillStyle = "rgba(237, 237, 240, 0.65)"; // --text a 65% — waveform em si é quieta
  ctx.beginPath();

  const firstBucket = Math.floor(view.start / level.samplesPerPeak);
  const lastBucket = Math.ceil(view.end / level.samplesPerPeak);
  const samplesPerPixel = (view.end - view.start) / widthCss;

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

  // linha de zero (referência visual, discreta)
  ctx.strokeStyle = "rgba(237, 237, 240, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(widthCss, midY);
  ctx.stroke();

  if (playheadSample !== null && playheadSample >= view.start && playheadSample <= view.end) {
    const x = (playheadSample - view.start) / samplesPerPixel;
    ctx.strokeStyle = "#e2a63d"; // --accent — único lugar onde o acento aparece na waveform
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, heightCss);
    ctx.stroke();
  }
}

export function WaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewWindow>({ start: 0, end: 0 });

  const peaks = usePlayerStore((s) => s.peaks);
  const engine = usePlayerStore((s) => s.engine);
  const seek = usePlayerStore((s) => s.seek);
  const playbackState = usePlayerStore((s) => s.playbackState);

  const [view, setView] = useState<ViewWindow>({ start: 0, end: 0 });
  const isDraggingRef = useRef(false);

  // inicializa a janela de visão com a faixa inteira assim que os peaks chegam
  useEffect(() => {
    if (peaks) setView({ start: 0, end: peaks.totalSamples });
  }, [peaks]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const sampleAtClientX = (clientX: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return null;
    const rect = canvas.getBoundingClientRect();
    const xRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const { start, end } = viewRef.current;
    return start + xRatio * (end - start);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!peaks) return;
    isDraggingRef.current = true;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const sample = sampleAtClientX(e.clientX);
    if (sample !== null) seek(sample / peaks.sampleRate);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !peaks) return;
    const sample = sampleAtClientX(e.clientX);
    if (sample !== null) seek(sample / peaks.sampleRate);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!peaks) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xRatio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));

    const { start, end } = viewRef.current;
    const span = end - start;
    const cursorSample = start + xRatio * span;

    const zoomFactor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    let newSpan = span * zoomFactor;
    newSpan = Math.max(MIN_VISIBLE_SAMPLES, Math.min(newSpan, peaks.totalSamples));

    let newStart = cursorSample - xRatio * newSpan;
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

  // desenha a cada frame — nunca via setState, só leitura direta do engine (ver useAnimationFrame.ts)
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
    drawWaveform(ctx, widthCss, heightCss, peaks, viewRef.current, playheadSample);
  }, Boolean(peaks));

  if (!peaks) return null;

  return (
    <div ref={containerRef} className="waveform">
      <canvas
        ref={canvasRef}
        className="waveform__canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        aria-label={`Waveform do áudio, reprodução ${playbackState}`}
      />
    </div>
  );
}
