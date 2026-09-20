import { describe, it, expect } from "vitest";
import { buildPeakPyramid, pickLevelForZoom } from "../peaks";

function sineWave(samples: number, amplitude = 1): Float32Array {
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    data[i] = Math.sin((i / samples) * Math.PI * 20) * amplitude;
  }
  return data;
}

describe("buildPeakPyramid", () => {
  it("captura corretamente o pico máximo de um sinal conhecido", () => {
    const data = new Float32Array([0, 0.2, -0.5, 0.9, -0.9, 0.1]);
    const pyramid = buildPeakPyramid(data, 44_100);
    const level0 = pyramid.levels[0];

    // um único bucket cobre todas as 6 amostras (samplesPerPeak base é 256)
    expect(level0.data[0]).toBeCloseTo(-0.9); // min
    expect(level0.data[1]).toBeCloseTo(0.9); // max
  });

  it("gera múltiplos níveis para um sinal longo o suficiente", () => {
    const data = sineWave(200_000);
    const pyramid = buildPeakPyramid(data, 44_100);
    expect(pyramid.levels.length).toBeGreaterThan(1);
    // cada nível deve ter samplesPerPeak estritamente crescente
    for (let i = 1; i < pyramid.levels.length; i++) {
      expect(pyramid.levels[i].samplesPerPeak).toBeGreaterThan(
        pyramid.levels[i - 1].samplesPerPeak,
      );
    }
  });

  it("nunca ultrapassa a amplitude real do sinal (dentro de [-1, 1] para este caso)", () => {
    const data = sineWave(50_000, 0.8);
    const pyramid = buildPeakPyramid(data, 44_100);
    for (const level of pyramid.levels) {
      for (let i = 0; i < level.data.length; i++) {
        expect(Math.abs(level.data[i])).toBeLessThanOrEqual(0.80001);
      }
    }
  });
});

describe("pickLevelForZoom", () => {
  it("escolhe um nível mais grosso quando a janela visível é grande (zoom out)", () => {
    const pyramid = buildPeakPyramid(sineWave(1_000_000), 44_100);
    const zoomedOut = pickLevelForZoom(pyramid, 1_000_000, 800);
    const zoomedIn = pickLevelForZoom(pyramid, 10_000, 800);

    expect(zoomedOut.samplesPerPeak).toBeGreaterThanOrEqual(zoomedIn.samplesPerPeak);
  });

  it("nunca escolhe um nível mais fino do que o disponível", () => {
    const pyramid = buildPeakPyramid(sineWave(1_000), 44_100);
    const level = pickLevelForZoom(pyramid, 1_000, 4_000);
    expect(pyramid.levels).toContain(level);
  });
});
