/**
 * Validação client-side de arquivo de áudio, ANTES de gastar upload/decode.
 * Checa magic bytes reais (não confia só na extensão) — ver docs/SPEC.md §4.2.
 */

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB (plano gratuito)
export const MAX_DURATION_SECONDS = 30 * 60; // 30 min (plano gratuito)

export type SupportedFormat = "mp3" | "wav" | "flac" | "ogg";

export interface ValidationError {
  code:
    | "unsupported-format"
    | "too-large"
    | "too-long"
    | "empty"
    | "corrupt";
  message: string;
}

export type ValidationResult =
  | { ok: true; format: SupportedFormat }
  | { ok: false; error: ValidationError };

/**
 * Lê os primeiros bytes do arquivo e identifica o formato pela assinatura real,
 * não pela extensão do nome do arquivo (que pode estar errada ou ausente).
 */
export async function sniffFormat(file: File): Promise<SupportedFormat | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...head.slice(start, start + len));

  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "wav";
  if (ascii(0, 4) === "fLaC") return "flac";
  if (ascii(0, 4) === "OggS") return "ogg";

  // MP3: ID3v2 no início, ou um frame sync de MPEG (11 bits em 1) em qualquer
  // ponto próximo ao início — arquivos MP3 "crus" não têm um header fixo.
  if (ascii(0, 3) === "ID3") return "mp3";
  for (let i = 0; i < head.length - 1; i++) {
    if (head[i] === 0xff && (head[i + 1] & 0xe0) === 0xe0) return "mp3";
  }

  return null;
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export async function validateAudioFile(file: File): Promise<ValidationResult> {
  if (file.size === 0) {
    return {
      ok: false,
      error: { code: "empty", message: "O arquivo está vazio." },
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: {
        code: "too-large",
        message: `Este arquivo tem ${formatBytes(file.size)}; o limite é ${formatBytes(
          MAX_FILE_SIZE_BYTES,
        )} — tente um formato comprimido como MP3.`,
      },
    };
  }

  const format = await sniffFormat(file);
  if (!format) {
    return {
      ok: false,
      error: {
        code: "unsupported-format",
        message:
          "Formato não reconhecido. Formatos suportados: MP3, WAV, FLAC, OGG.",
      },
    };
  }

  return { ok: true, format };
}

/**
 * Checagem de duração, feita DEPOIS da decodificação (precisa do AudioBuffer).
 * Separada de validateAudioFile porque decodificar já é um passo mais caro.
 */
export function validateDuration(durationSeconds: number): ValidationError | null {
  if (durationSeconds <= 0) {
    return { code: "corrupt", message: "Não foi possível ler a duração do áudio." };
  }
  if (durationSeconds > MAX_DURATION_SECONDS) {
    return {
      code: "too-long",
      message: `Esta faixa tem ${Math.round(
        durationSeconds / 60,
      )} min; o limite é ${MAX_DURATION_SECONDS / 60} min no plano gratuito.`,
    };
  }
  return null;
}
