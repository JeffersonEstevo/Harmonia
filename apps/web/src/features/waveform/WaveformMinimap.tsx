import { useEffect, useRef } from "react";
import type { PeakPyramid } from "../../lib/waveform/peaks";
import { getOverviewLevel } from "../../lib/waveform/peaks";
import "./WaveformMinimap.css";

interface ViewWindow {
  start: number;
  end: number;
}

interface Props {
  peaks: PeakPyramid;
  view: ViewWindow;
  onViewChange: (view: ViewWindow) => void;
}

/**
 * Régua de "visão geral" com a faixa inteira, sempre no nível de picos mais
 * grosso disponível — clicar/arrastar reposiciona a janela de zoom principal,
 * mantendo o mesmo span (mesma quantidade de zoom). Ver docs/SPEC.md §4.3.
 */
export function WaveformMinimap({ peaks, view, onViewChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const widthCss = canvas.clientWidth;
    const heightCss = canvas.clientHeight;
    canvas.width = widthCss * dpr;
    canvas.height = heightCss * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, widthCss, heightCss);

    const level = getOverviewLevel(peaks);
    const midY = heightCss / 2;
    const scaleY = heightCss / 2;
    const samplesPerPixel = peaks.totalSamples / widthCss;

    ctx.fillStyle = "rgba(237, 237, 240, 0.4)";
    for (let x = 0; x < widthCss; x++) {
      const sample = x * samplesPerPixel;
      const bucket = Math.floor(sample / level.samplesPerPeak);
      if (bucket * 2 + 1 >= level.data.length) continue;
      const min = level.data[bucket * 2];
      const max = level.data[bucket * 2 + 1];
      const yTop = midY - max * scaleY;
      const yBottom = midY - min * scaleY;
      ctx.fillRect(x, yTop, 1, Math.max(1, yBottom - yTop));
    }

    // retângulo destacando a janela de zoom atual
    const viewStartX = view.start / samplesPerPixel;
    const viewEndX = view.end / samplesPerPixel;
    ctx.fillStyle = "rgba(226, 166, 61, 0.16)";
    ctx.fillRect(viewStartX, 0, Math.max(1, viewEndX - viewStartX), heightCss);
    ctx.strokeStyle = "#e2a63d";
    ctx.lineWidth = 1;
    ctx.strokeRect(viewStartX + 0.5, 0.5, Math.max(1, viewEndX - viewStartX - 1), heightCss - 1);
  }, [peaks, view]);

  const moveViewTo = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const clickSample = ratio * peaks.totalSamples;
    const span = view.end - view.start;

    let newStart = clickSample - span / 2;
    let newEnd = newStart + span;
    if (newStart < 0) {
      newEnd -= newStart;
      newStart = 0;
    }
    if (newEnd > peaks.totalSamples) {
      newStart -= newEnd - peaks.totalSamples;
      newEnd = peaks.totalSamples;
    }
    onViewChange({ start: Math.max(0, newStart), end: newEnd });
  };

  return (
    <canvas
      ref={canvasRef}
      className="waveform-minimap"
      onPointerDown={(e) => {
        isDraggingRef.current = true;
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        moveViewTo(e.clientX);
      }}
      onPointerMove={(e) => {
        if (isDraggingRef.current) moveViewTo(e.clientX);
      }}
      onPointerUp={() => {
        isDraggingRef.current = false;
      }}
      aria-label="Visão geral da faixa — clique para navegar"
    />
  );
}
