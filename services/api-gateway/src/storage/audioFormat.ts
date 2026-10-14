/**
 * Detecção de formato de áudio pelo CONTEÚDO (magic bytes), nunca pelo
 * Content-Type/extensão enviados pelo cliente — ver docs/SPEC.md §5
 * (Segurança: "revalidação server-side de tipo/tamanho independentemente
 * das checagens do client"). O mime e a extensão retornados são sempre
 * valores canônicos nossos, então nada controlado pelo usuário chega aos
 * headers de resposta nem ao nome do arquivo em disco.
 */

export interface DetectedAudioFormat {
  mime: string;
  ext: "mp3" | "wav" | "flac" | "ogg";
}

export function detectAudioFormat(buffer: Buffer): DetectedAudioFormat | null {
  if (buffer.length < 12) return null;

  const ascii = (start: number, len: number) => buffer.toString("latin1", start, start + len);

  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return { mime: "audio/wav", ext: "wav" };
  if (ascii(0, 4) === "fLaC") return { mime: "audio/flac", ext: "flac" };
  if (ascii(0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  if (ascii(0, 3) === "ID3") return { mime: "audio/mpeg", ext: "mp3" };

  // MP3 "cru" (sem ID3): frame sync de 11 bits em 1 logo no início. Só os
  // primeiros bytes — procurar no arquivo todo aceitaria lixo qualquer.
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return { mime: "audio/mpeg", ext: "mp3" };

  return null;
}
