import { chordHue } from "../chords/chordColor";
import { formatTime, keyLabel, type ExportableAnalysis } from "./types";

export interface SvgOptions {
  width?: number;
  theme?: "dark" | "light";
}

const THEMES = {
  dark: { bg: "#0d0d10", text: "#ededf0", muted: "#8b8b93", wave: "#c9c9ce", grid: "#ffffff", chordText: "#0d0d10", axis: "#2a2a30" },
  light: { bg: "#ffffff", text: "#16161a", muted: "#6b6b73", wave: "#3a3a42", grid: "#000000", chordText: "#16161a", axis: "#d6d6db" },
} as const;

/** Escapa texto pra uso seguro dentro de SVG/XML — títulos e acordes vêm de dados do usuário. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // caracteres de controle são ilegais em XML 1.0 e quebram o parse do arquivo inteiro
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

const f = (n: number) => n.toFixed(1);

function rulerStep(rowDurationSec: number, plotWidth: number): number {
  const candidates = [5, 10, 15, 30, 60, 120, 300];
  const minPx = 90;
  for (const c of candidates) {
    if ((c / rowDurationSec) * plotWidth >= minPx) return c;
  }
  return candidates[candidates.length - 1];
}

const MAX_ROWS = 14;
const LABEL_PX_PER_CHORD = 46; // largura-alvo do acorde "típico" pra o nome caber

/**
 * Quantas linhas e quantos segundos por linha. Uma faixa de 3 minutos numa
 * linha só dá blocos de ~12px — sem espaço pro nome do acorde, que é o ponto
 * da imagem. Então a faixa é quebrada em linhas (como numa partitura), com a
 * escala escolhida pra o acorde de duração mediana ter ~46px.
 */
export function planRows(a: ExportableAnalysis, plotWidth: number): { rows: number; rowDuration: number } {
  const duration = Math.max(a.durationSec, 0.001);
  const durations = a.chordSegments
    .map((s) => s.offset - s.onset)
    .filter((d) => d > 0)
    .sort((x, y) => x - y);
  const typical = durations.length ? durations[Math.floor(durations.length / 2)] : duration;

  const pxPerSec = LABEL_PX_PER_CHORD / Math.max(typical, 0.25);
  const wanted = Math.max(plotWidth / pxPerSec, 20); // nunca picota em linhas de < 20s
  let rows = Math.max(1, Math.ceil(duration / Math.min(wanted, duration)));
  rows = Math.min(rows, MAX_ROWS);
  return { rows, rowDuration: duration / rows };
}

/** Imagem anotada da faixa: waveform (envelope) + faixa de acordes + régua de tempo, em 1+ linhas. */
export function renderAnnotatedSvg(a: ExportableAnalysis, options: SvgOptions = {}): string {
  const W = options.width ?? 1200;
  const c = THEMES[options.theme ?? "dark"];
  const pad = 24;
  const plotW = W - pad * 2;
  const duration = Math.max(a.durationSec, 0.001);

  const { rows, rowDuration } = planRows(a, plotW);

  const headerH = 64;
  const waveH = rows === 1 ? 150 : 64;
  const stripH = 34;
  const rulerH = 28;
  const rowGap = 14;
  const rowH = waveH + 4 + stripH + rulerH;
  const footerH = 30;
  const H = headerH + rows * rowH + (rows - 1) * rowGap + footerH;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif">`,
  );
  parts.push(`<rect width="${W}" height="${H}" fill="${c.bg}"/>`);

  // cabeçalho
  const title = a.title.length > 70 ? `${a.title.slice(0, 69)}…` : a.title;
  const bits = [
    keyLabel(a) ? `Tom ${keyLabel(a)}` : null,
    a.bpm ? `${Math.round(a.bpm)} BPM` : null,
    formatTime(a.durationSec),
    `${a.chordSegments.length} acordes`,
  ].filter(Boolean);
  parts.push(`<text x="${pad}" y="34" font-size="20" font-weight="600" fill="${c.text}">${escapeXml(title)}</text>`);
  parts.push(`<text x="${pad}" y="54" font-size="13" fill="${c.muted}">${escapeXml(bits.join("  ·  "))}</text>`);

  const peaks = a.peaks && a.peaks.length >= 4 && a.peaks.length % 2 === 0 ? a.peaks : null;
  const beats = a.beatGrid.length > 0 && a.beatGrid.length <= 2500 ? a.beatGrid : [];

  for (let r = 0; r < rows; r++) {
    const t0 = r * rowDuration;
    const t1 = t0 + rowDuration;
    const rowTop = headerH + r * (rowH + rowGap);
    const waveTop = rowTop;
    const midY = waveTop + waveH / 2;
    const stripTop = waveTop + waveH + 4;
    const xOf = (t: number) => pad + ((Math.min(Math.max(t, t0), t1) - t0) / rowDuration) * plotW;

    // grade de batidas (discreta)
    const rowBeats = beats.filter((t) => t >= t0 && t < t1);
    if (rowBeats.length > 0) {
      const d = rowBeats.map((t) => `M${f(xOf(t))} ${waveTop}V${waveTop + waveH}`).join("");
      parts.push(`<path d="${d}" stroke="${c.grid}" stroke-opacity="0.08" stroke-width="1" fill="none"/>`);
    }

    // waveform (envelope min/max) como um único polígono — só os buckets desta linha
    if (peaks) {
      const n = peaks.length / 2;
      const amp = waveH / 2 - 3;
      const top: string[] = [];
      const bottom: string[] = [];
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) / n) * duration;
        if (t < t0 || t >= t1) continue;
        const x = xOf(t);
        top.push(`${f(x)} ${f(midY - Math.min(Math.max(peaks[i * 2 + 1], -1), 1) * amp)}`);
        bottom.push(`${f(x)} ${f(midY - Math.min(Math.max(peaks[i * 2], -1), 1) * amp)}`);
      }
      if (top.length >= 2) {
        parts.push(
          `<path d="M${top.join("L")}L${bottom.reverse().join("L")}Z" fill="${c.wave}" fill-opacity="0.75"/>`,
        );
      }
    }
    parts.push(`<line x1="${pad}" y1="${f(midY)}" x2="${W - pad}" y2="${f(midY)}" stroke="${c.axis}" stroke-width="1"/>`);

    // faixa de acordes (recortados à janela desta linha)
    for (const seg of a.chordSegments) {
      if (seg.offset <= t0 || seg.onset >= t1) continue;
      const x1 = xOf(seg.onset);
      const x2 = xOf(seg.offset);
      const w = x2 - x1;
      if (w <= 0.5) continue;
      parts.push(
        `<rect x="${f(x1)}" y="${stripTop}" width="${f(w)}" height="${stripH}" fill="hsl(${chordHue(seg.chord)}, 45%, 58%)" fill-opacity="0.85" stroke="${c.bg}" stroke-width="1"/>`,
      );
      // só rotula se couber (≈8px por caractere em 13px) — texto estourando vira ruído
      if (w >= seg.chord.length * 8 + 10) {
        parts.push(
          `<text x="${f(x1 + 6)}" y="${stripTop + 22}" font-size="13" font-weight="600" fill="${c.chordText}">${escapeXml(seg.chord)}</text>`,
        );
      }
    }

    // régua de tempo (tempos absolutos, mesmo em linhas do meio da faixa)
    const step = rulerStep(rowDuration, plotW);
    const rulerY = stripTop + stripH + 16;
    for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-6; t += step) {
      const x = xOf(t);
      const anchor = x < pad + 14 ? "start" : x > W - pad - 14 ? "end" : "middle";
      parts.push(
        `<line x1="${f(x)}" y1="${stripTop + stripH}" x2="${f(x)}" y2="${stripTop + stripH + 5}" stroke="${c.muted}" stroke-width="1"/>`,
      );
      parts.push(
        `<text x="${f(x)}" y="${rulerY}" font-size="11" fill="${c.muted}" text-anchor="${anchor}">${formatTime(t)}</text>`,
      );
    }
  }

  parts.push(`<text x="${W - pad}" y="${H - 10}" font-size="11" fill="${c.muted}" text-anchor="end">Harmonia</text>`);
  parts.push("</svg>");
  return parts.join("\n");
}
