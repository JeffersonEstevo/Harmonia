import { buildChordChart } from "./chordChart";
import { formatTime, keyLabel, type ExportableAnalysis } from "./types";

/**
 * As fontes padrão do PDF (Helvetica) só cobrem Latin-1: acentos do português
 * funcionam, mas emoji/CJK/símbolos viram lixo. Troca por "?" em vez de
 * emitir caracteres que o PDF renderizaria errado.
 */
export function toLatin1Safe(text: string): string {
  return Array.from(text)
    .map((ch) => (ch.codePointAt(0)! <= 0xff && ch.codePointAt(0)! >= 0x20 ? ch : "?"))
    .join("");
}

/**
 * Cifra em PDF (A4, retrato). O jsPDF (~350 KB) é importado SOB DEMANDA — só
 * quem exporta PDF paga esse download.
 */
export async function buildChordChartPdf(a: ExportableAnalysis): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageW = 210;
  const pageH = 297;
  const margin = 16;
  const timeColW = 14;
  const gridX = margin + timeColW;
  const gridW = pageW - margin - gridX;
  const rowH = 17;

  const chart = buildChordChart(a);
  const barW = gridW / chart.barsPerLine;

  // --- cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 24);
  const title = toLatin1Safe(a.title);
  doc.text(title.length > 60 ? `${title.slice(0, 59)}...` : title, margin, margin + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(95, 95, 105);
  const meta = [
    keyLabel(a) ? `Tom: ${keyLabel(a)}` : null,
    a.bpm ? `${Math.round(a.bpm)} BPM` : null,
    `Duração: ${formatTime(a.durationSec)}`,
  ].filter(Boolean);
  doc.text(meta.join("   |   "), margin, margin + 11);

  let y = margin + 22;

  if (chart.lines.length === 0) {
    doc.setFontSize(11);
    doc.text("Nenhum acorde detectado nesta faixa.", margin, y);
  }

  // --- linhas da cifra
  for (const line of chart.lines) {
    if (y + rowH > pageH - margin - 8) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 150);
    doc.text(formatTime(line.startTime), margin, y + rowH / 2 + 1);

    doc.setDrawColor(150, 150, 160);
    doc.setLineWidth(0.3);
    // barras verticais: início de cada compasso + fechamento da linha
    for (let b = 0; b <= chart.barsPerLine; b++) {
      if (b <= line.bars.length) doc.line(gridX + b * barW, y, gridX + b * barW, y + rowH);
    }

    line.bars.forEach((bar, barIndex) => {
      const barX = gridX + barIndex * barW;
      const totalBeats = bar.cells.reduce((sum, c) => sum + c.beats, 0) || 1;
      let cx = barX;
      for (const cell of bar.cells) {
        const cellW = (cell.beats / totalBeats) * barW;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 24);
        // acordes ocupando pouco do compasso ficam menores pra não invadir o vizinho
        const size = cellW < barW * 0.4 ? 10 : 14;
        doc.setFontSize(size);
        const label = cell.chord ? toLatin1Safe(cell.chord) : "N.C.";
        if (!cell.chord) doc.setTextColor(150, 150, 160);
        doc.text(label, cx + 2.5, y + rowH / 2 + 2);
        cx += cellW;
      }
    });

    // linha de base horizontal sutil
    doc.setDrawColor(215, 215, 222);
    doc.line(gridX, y + rowH, gridX + gridW, y + rowH);
    y += rowH + 3;
  }

  // --- nota de rodapé honesta, em todas as páginas
  const pages = doc.getNumberOfPages();
  const note =
    chart.mode === "bars"
      ? "Compassos assumem 4/4 a partir da primeira batida detectada. Acordes estimados automaticamente — podem conter erros."
      : "Sem batidas confiáveis detectadas: um acorde por quadro, na ordem. Acordes estimados automaticamente — podem conter erros.";
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 160);
    doc.text(note, margin, pageH - 10);
    doc.text(`Harmonia  ·  ${p}/${pages}`, pageW - margin, pageH - 10, { align: "right" });
  }

  return doc.output("arraybuffer");
}
