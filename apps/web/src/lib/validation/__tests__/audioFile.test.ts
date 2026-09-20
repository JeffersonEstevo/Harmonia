import { describe, it, expect } from "vitest";
import { sniffFormat, validateAudioFile, validateDuration, MAX_FILE_SIZE_BYTES } from "../audioFile";

function makeFile(bytes: number[], name = "track.mp3", type = "audio/mpeg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("sniffFormat", () => {
  it("reconhece WAV pelo header RIFF/WAVE", async () => {
    const bytes = [
      ...Array.from("RIFF").map((c) => c.charCodeAt(0)),
      0, 0, 0, 0,
      ...Array.from("WAVE").map((c) => c.charCodeAt(0)),
    ];
    expect(await sniffFormat(makeFile(bytes, "a.wav"))).toBe("wav");
  });

  it("reconhece FLAC pelo header fLaC", async () => {
    const bytes = Array.from("fLaC").map((c) => c.charCodeAt(0));
    expect(await sniffFormat(makeFile(bytes, "a.flac"))).toBe("flac");
  });

  it("reconhece OGG pelo header OggS", async () => {
    const bytes = Array.from("OggS").map((c) => c.charCodeAt(0));
    expect(await sniffFormat(makeFile(bytes, "a.ogg"))).toBe("ogg");
  });

  it("reconhece MP3 com ID3v2", async () => {
    const bytes = Array.from("ID3").map((c) => c.charCodeAt(0));
    expect(await sniffFormat(makeFile(bytes))).toBe("mp3");
  });

  it("reconhece MP3 cru pelo frame sync", async () => {
    const bytes = [0xff, 0xfb, 0x90, 0x00];
    expect(await sniffFormat(makeFile(bytes))).toBe("mp3");
  });

  it("NÃO confia só na extensão — um .mp3 com bytes aleatórios não é reconhecido", async () => {
    const bytes = [0x00, 0x01, 0x02, 0x03];
    expect(await sniffFormat(makeFile(bytes, "fake.mp3"))).toBeNull();
  });
});

describe("validateAudioFile", () => {
  it("rejeita arquivo vazio", async () => {
    const result = await validateAudioFile(makeFile([]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("empty");
  });

  it("rejeita arquivo maior que o limite", async () => {
    const big = new File([new Uint8Array(MAX_FILE_SIZE_BYTES + 1)], "big.wav");
    const result = await validateAudioFile(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("too-large");
  });

  it("aceita um WAV válido dentro do limite", async () => {
    const bytes = [
      ...Array.from("RIFF").map((c) => c.charCodeAt(0)),
      0, 0, 0, 0,
      ...Array.from("WAVE").map((c) => c.charCodeAt(0)),
    ];
    const result = await validateAudioFile(makeFile(bytes, "a.wav"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.format).toBe("wav");
  });
});

describe("validateDuration", () => {
  it("rejeita duração zero/negativa", () => {
    expect(validateDuration(0)?.code).toBe("corrupt");
  });

  it("rejeita faixas acima do limite do plano gratuito", () => {
    expect(validateDuration(31 * 60)?.code).toBe("too-long");
  });

  it("aceita duração dentro do limite", () => {
    expect(validateDuration(180)).toBeNull();
  });
});
