import { describe, expect, it } from "vitest";
import { detectAudioFormat } from "../src/storage/audioFormat.js";

const pad = (head: number[] | string, total = 32) => {
  const bytes = typeof head === "string" ? Buffer.from(head, "latin1") : Buffer.from(head);
  return Buffer.concat([bytes, Buffer.alloc(Math.max(0, total - bytes.length))]);
};

describe("detectAudioFormat (por conteúdo, não por Content-Type)", () => {
  it("reconhece WAV", () => {
    const buf = pad("RIFF\0\0\0\0WAVE");
    expect(detectAudioFormat(buf)).toEqual({ mime: "audio/wav", ext: "wav" });
  });
  it("reconhece FLAC", () => {
    expect(detectAudioFormat(pad("fLaC"))).toEqual({ mime: "audio/flac", ext: "flac" });
  });
  it("reconhece OGG", () => {
    expect(detectAudioFormat(pad("OggS"))).toEqual({ mime: "audio/ogg", ext: "ogg" });
  });
  it("reconhece MP3 com ID3 e MP3 cru (frame sync)", () => {
    expect(detectAudioFormat(pad("ID3"))?.ext).toBe("mp3");
    expect(detectAudioFormat(pad([0xff, 0xfb, 0x90, 0x00]))?.ext).toBe("mp3");
  });
  it("REJEITA HTML/script, mesmo que o cliente alegue ser áudio", () => {
    expect(detectAudioFormat(pad("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectAudioFormat(pad("<svg onload=alert(1)>"))).toBeNull();
  });
  it("rejeita arquivo curto demais e bytes aleatórios", () => {
    expect(detectAudioFormat(Buffer.from("ID3"))).toBeNull();
    expect(detectAudioFormat(pad([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
  it("só aceita frame sync de MP3 no INÍCIO (não em qualquer posição)", () => {
    expect(detectAudioFormat(pad([0x00, 0x00, 0xff, 0xfb, 0x90]))).toBeNull();
  });
});
