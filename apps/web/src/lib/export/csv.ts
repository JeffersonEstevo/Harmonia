import { keyLabel, type ExportableAnalysis } from "./types";

/**
 * Neutraliza "CSV injection": uma célula de texto que começa com = + - @
 * (ou tab/CR) é interpretada como FÓRMULA por Excel/Sheets/LibreOffice ao
 * abrir o arquivo. Prefixar com apóstrofo faz virar texto literal. O título
 * vem do nome do arquivo (controlado pelo usuário) e o símbolo de acorde de
 * dados salvos, então nenhum texto é emitido sem passar por aqui.
 */
export function csvText(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

const num = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** Uma linha por acorde; metadados da faixa no fim como linhas "chave,valor". */
export function toCsv(a: ExportableAnalysis): string {
  const lines = ["chord,onset_sec,offset_sec,confidence"];
  for (const c of a.chordSegments) {
    lines.push(
      [
        csvText(c.chord),
        num(c.onset),
        num(c.offset),
        c.confidence !== undefined ? num(c.confidence) : "",
      ].join(","),
    );
  }
  lines.push("", "meta,value");
  lines.push(`title,${csvText(a.title)}`);
  lines.push(`key,${csvText(keyLabel(a) ?? "")}`);
  lines.push(`bpm,${a.bpm !== null ? num(a.bpm) : ""}`);
  lines.push(`duration_sec,${num(a.durationSec)}`);
  return lines.join("\r\n") + "\r\n";
}
