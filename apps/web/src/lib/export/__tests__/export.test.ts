import { describe, expect, it } from "vitest";
import { buildPeakPyramid } from "../../waveform/peaks";
import { buildChordChart } from "../chordChart";
import { toCsv, csvText } from "../csv";
import { toJson } from "../json";
import { overviewPeaks } from "../overviewPeaks";
import { buildChordChartPdf, toLatin1Safe } from "../pdf";
import { escapeXml, planRows, renderAnnotatedSvg } from "../svg";
import { safeFilename, type ExportableAnalysis } from "../types";

/** Bm-G-D-A a 120 BPM: 4 batidas por acorde (2s), 8 segundos, grade de batidas a cada 0,5s. */
function progression(overrides: Partial<ExportableAnalysis> = {}): ExportableAnalysis {
  return {
    title: "Progressão Bm-G-D-A",
    durationSec: 8,
    key: "D",
    keyScale: "major",
    bpm: 120,
    beatGrid: Array.from({ length: 16 }, (_, i) => i * 0.5),
    chordSegments: [
      { chord: "Bm", onset: 0, offset: 2, confidence: 0.95 },
      { chord: "G", onset: 2, offset: 4, confidence: 0.87 },
      { chord: "D", onset: 4, offset: 6, confidence: 0.77 },
      { chord: "A", onset: 6, offset: 8, confidence: 0.92 },
    ],
    ...overrides,
  };
}

describe("buildChordChart", () => {
  it("monta compassos a partir da grade de batidas: um acorde por compasso", () => {
    const chart = buildChordChart(progression());

    expect(chart.mode).toBe("bars");
    expect(chart.lines).toHaveLength(1); // 4 compassos cabem numa linha
    const chords = chart.lines[0].bars.map((b) => b.cells.map((c) => c.chord));
    expect(chords).toEqual([["Bm"], ["G"], ["D"], ["A"]]);
    expect(chart.lines[0].bars[0].cells[0].beats).toBe(4);
  });

  it("divide um compasso com troca de acorde no meio (2 batidas + 2 batidas)", () => {
    const chart = buildChordChart(
      progression({
        chordSegments: [
          { chord: "C", onset: 0, offset: 1, confidence: 1 },
          { chord: "G", onset: 1, offset: 8, confidence: 1 },
        ],
      }),
    );
    expect(chart.lines[0].bars[0].cells).toEqual([
      { chord: "C", beats: 2 },
      { chord: "G", beats: 2 },
    ]);
  });

  it("marca trechos sem acorde como N.C. (null)", () => {
    const chart = buildChordChart(
      progression({ chordSegments: [{ chord: "Bm", onset: 0, offset: 2, confidence: 1 }] }),
    );
    expect(chart.lines[0].bars[1].cells[0].chord).toBeNull();
  });

  it("agrupa 4 compassos por linha e rotula cada linha com o tempo inicial", () => {
    const beatGrid = Array.from({ length: 40 }, (_, i) => i * 0.5); // 10 compassos
    const chart = buildChordChart(progression({ beatGrid, durationSec: 20 }));
    expect(chart.lines).toHaveLength(3);
    expect(chart.lines[1].startTime).toBe(8); // compasso 5 começa na batida 16 → 8s
  });

  it("sem batidas suficientes cai no modo timeline (um acorde por quadro, na ordem)", () => {
    const chart = buildChordChart(progression({ beatGrid: [0.5, 1.0] }));
    expect(chart.mode).toBe("timeline");
    expect(chart.lines[0].bars.map((b) => b.cells[0].chord)).toEqual(["Bm", "G", "D", "A"]);
  });

  it("não quebra sem acordes nem sem batidas", () => {
    const chart = buildChordChart(progression({ chordSegments: [], beatGrid: [] }));
    expect(chart.lines).toEqual([]);
  });
});

describe("overviewPeaks", () => {
  it("devolve exatamente 2*buckets valores, dentro de [-1, 1]", () => {
    const data = new Float32Array(200_000);
    for (let i = 0; i < data.length; i++) data[i] = 0.8 * Math.sin(i / 50);
    const peaks = overviewPeaks(buildPeakPyramid(data, 44_100), 500);

    expect(peaks).toHaveLength(1000);
    expect(Math.max(...peaks)).toBeLessThanOrEqual(0.8001);
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(-0.8001);
    for (let i = 0; i < peaks.length; i += 2) expect(peaks[i]).toBeLessThanOrEqual(peaks[i + 1]);
  });

  it("funciona com áudio curto (menos amostras que buckets)", () => {
    const peaks = overviewPeaks(buildPeakPyramid(new Float32Array(300).fill(0.5), 44_100), 1000);
    expect(peaks).toHaveLength(2000);
    expect(peaks.every(Number.isFinite)).toBe(true);
  });
});

describe("JSON", () => {
  it("exporta um documento versionado e re-parseável", () => {
    const parsed = JSON.parse(toJson(progression()));
    expect(parsed.version).toBe(1);
    expect(parsed.key).toBe("D");
    expect(parsed.bpm).toBe(120);
    expect(parsed.chords).toHaveLength(4);
    expect(parsed.chords[0]).toEqual({ chord: "Bm", onset: 0, offset: 2, confidence: 0.95 });
  });

  it("tom menor sai como 'Bm' / 'Am'", () => {
    expect(JSON.parse(toJson(progression({ key: "B", keyScale: "minor" }))).key).toBe("Bm");
  });
});

describe("CSV", () => {
  it("emite cabeçalho, uma linha por acorde e metadados", () => {
    const csv = toCsv(progression());
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("chord,onset_sec,offset_sec,confidence");
    expect(lines[1]).toBe("Bm,0,2,0.95");
    expect(csv).toContain("bpm,120");
    expect(csv).toContain("key,D");
  });

  it("neutraliza CSV injection (= + - @) em título e acordes", () => {
    expect(csvText('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvText("+1+1")).toBe("'+1+1");
    expect(csvText("-2+3")).toBe("'-2+3");
    expect(csvText("@SUM(A1)")).toBe("'@SUM(A1)");

    const csv = toCsv(progression({ title: "=cmd|' /C calc'!A0" }));
    expect(csv).not.toMatch(/^title,=/m);
    expect(csv).toContain("title,'=cmd");
  });

  it("escapa vírgula, aspas e quebra de linha", () => {
    expect(csvText("a,b")).toBe('"a,b"');
    expect(csvText('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvText("l1\nl2")).toBe('"l1\nl2"');
  });

  it("não prefixa texto comum nem acordes normais", () => {
    expect(csvText("F#m7")).toBe("F#m7");
    expect(csvText("Bm")).toBe("Bm");
  });
});

describe("SVG anotado", () => {
  const peaks = Array.from({ length: 400 }, (_, i) => (i % 2 === 0 ? -0.6 : 0.6));

  it("gera um XML bem-formado (parseável como image/svg+xml)", () => {
    const svg = renderAnnotatedSvg(progression({ peaks }));
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");

    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.tagName).toBe("svg");
    expect(doc.documentElement.getAttribute("width")).toBe("1200");
  });

  it("inclui os acordes, o tom e o BPM", () => {
    const svg = renderAnnotatedSvg(progression({ peaks }));
    for (const chord of ["Bm", "G", "D", "A"]) expect(svg).toContain(`>${chord}</text>`);
    expect(svg).toContain("Tom D");
    expect(svg).toContain("120 BPM");
  });

  it("ESCAPA título e acordes maliciosos (sem XSS/quebra de XML)", () => {
    const evil = '</text><script>alert(1)</script><text x="0">';
    const svg = renderAnnotatedSvg(
      progression({
        title: evil,
        chordSegments: [{ chord: '"><img src=x onerror=alert(1)>', onset: 0, offset: 8 }],
      }),
    );

    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<img");
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("script")).toBeNull();
  });

  it("escapeXml cobre os 5 caracteres reservados e remove controles ilegais", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
    expect(escapeXml("ok\u0000\u0008\u001f")).toBe("ok");
  });

  it("funciona sem peaks e sem acordes (não quebra)", () => {
    const svg = renderAnnotatedSvg(progression({ chordSegments: [], beatGrid: [], peaks: null }));
    expect(new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror")).toBeNull();
  });

  it("tema claro usa fundo branco", () => {
    expect(renderAnnotatedSvg(progression(), { theme: "light" })).toContain('fill="#ffffff"');
  });
});

describe("SVG: faixa longa quebra em linhas pra os nomes dos acordes caberem", () => {
  /** 3 min, 1 acorde a cada 2s (96 acordes) — o caso real que antes saía SEM nenhum nome de acorde */
  function longTrack(): ExportableAnalysis {
    const prog = ["Bm", "G", "D", "A"];
    return progression({
      durationSec: 192,
      beatGrid: [],
      chordSegments: Array.from({ length: 96 }, (_, i) => ({
        chord: prog[i % 4],
        onset: i * 2,
        offset: i * 2 + 2,
      })),
    });
  }

  it("música curta cabe numa linha; música longa vira várias", () => {
    expect(planRows(progression(), 1152).rows).toBe(1);
    expect(planRows(longTrack(), 1152).rows).toBeGreaterThan(1);
  });

  it("a maioria dos acordes da faixa longa recebe rótulo de texto (regressão: antes 0)", () => {
    const svg = renderAnnotatedSvg(longTrack());
    const labels = (svg.match(/font-weight="600" fill="#0d0d10">(Bm|G|D|A)<\/text>/g) ?? []).length;
    expect(labels).toBeGreaterThanOrEqual(90); // de 96; só blocos cortados na borda da linha podem ficar sem
  });

  it("não passa de 14 linhas mesmo em faixas enormes, e continua XML válido", () => {
    const huge = progression({
      durationSec: 3600,
      beatGrid: [],
      chordSegments: Array.from({ length: 1800 }, (_, i) => ({ chord: "C", onset: i * 2, offset: i * 2 + 2 })),
    });
    expect(planRows(huge, 1152).rows).toBeLessThanOrEqual(14);
    const doc = new DOMParser().parseFromString(renderAnnotatedSvg(huge), "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
  });
});

describe("PDF da cifra", () => {
  it("gera um PDF válido (assinatura %PDF e trailer %%EOF)", async () => {
    const buf = await buildChordChartPdf(progression());
    const text = new TextDecoder("latin1").decode(new Uint8Array(buf));

    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(1000);
  });

  it("não quebra com faixa sem acordes", async () => {
    const buf = await buildChordChartPdf(progression({ chordSegments: [], beatGrid: [] }));
    expect(buf.byteLength).toBeGreaterThan(500);
  });

  it("pagina quando a cifra é longa (mais de uma página)", async () => {
    const beatGrid = Array.from({ length: 800 }, (_, i) => i * 0.5); // 200 compassos = 50 linhas
    const buf = await buildChordChartPdf(progression({ beatGrid, durationSec: 400 }));
    const text = new TextDecoder("latin1").decode(new Uint8Array(buf));
    const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
  });

  it("toLatin1Safe troca caracteres fora do Latin-1 (emoji/CJK) por '?', preserva acentos", () => {
    expect(toLatin1Safe("Ação ☺ 日本")).toBe("Ação ? ??");
  });
});

describe("safeFilename", () => {
  it("remove separadores de caminho e caracteres reservados", () => {
    expect(safeFilename("../../etc/passwd", "pdf")).toBe("_.._etc_passwd.pdf");
    expect(safeFilename('a<b>:c"d|e?f*g', "csv")).toBe("a_b__c_d_e_f_g.csv");
  });
  it("usa um nome padrão para título vazio e limita o tamanho", () => {
    expect(safeFilename("   ", "json")).toBe("harmonia.json");
    expect(safeFilename("x".repeat(500), "png").length).toBeLessThanOrEqual(84);
  });
});
