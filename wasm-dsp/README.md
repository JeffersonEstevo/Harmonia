# wasm-dsp

Módulo de DSP client-side (FFT, chromagram, detecção de onset/tempo, classificador
de acordes de Nível 1) compilado para WebAssembly via **AssemblyScript** — não
Rust, por falta de toolchain no ambiente de build original; ver `docs/DECISIONS.md`
pelo raciocínio completo e o caminho de migração se quiser trocar depois.

## Build

```bash
npm install
npm run build          # gera build/chord-dsp.{wasm,js,d.ts}
npm run smoke-test      # roda testes de sanidade com áudio sintético via Node
```

Depois de buildar, copie os artefatos pra `apps/web/public/wasm/`:

```bash
cp build/chord-dsp.* ../apps/web/public/wasm/
```

(o `apps/web` consome o `.wasm` como asset estático servido diretamente, sem
o Vite precisar entender bundling de WASM — mesmo padrão usado pro
`AudioWorklet` em `apps/web/public/worklets/`.)

## O que está implementado

- `analyzeFrames`: FFT (Cooley-Tukey radix-2) + chromagram (mapeamento bin→classe
  de altura, não CQT logarítmica de verdade — ver DECISIONS.md) + onset (spectral flux)
- `classifyChords`: template matching por cosine similarity contra 36 templates
  (12 fundamentais × maior/menor/7ª dominante)
- `estimateTempo`: autocorrelação do envelope de onset, 60–200 BPM

Ver `docs/SPEC.md` §4.4 e §6.2 pro desenho completo do pipeline (incluindo a
Camada 2, server-side, que fica pra Fase 4).
