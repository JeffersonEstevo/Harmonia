# Log de Decisões Técnicas (ADR — Architecture Decision Records)

Registro de decisões técnicas relevantes do projeto, com data e motivo. Consulte antes de propor mudanças a algo já decidido aqui.

| Data | Decisão | Motivo |
|---|---|---|
| 2026-09-20 | Especificação técnica aprovada (ver `docs/SPEC.md`) | Baseline funcional/técnico do projeto |
| 2026-09-20 | Estrutura de repositório definida como monorepo `apps/` + `services/` + `packages/` (ver `docs/STRUCTURE.md`) | Alinhar com convenções reais de monorepos poliglotas (Turborepo/Nx-style); suportar TS/Python/Rust sem layout artificial; Docker opcional, não obrigatório |
| 2026-09-20 | `docs/diagrams/` reservado apenas para exports estáticos de diagramas (imagens/SVG), não para documentação em Markdown | Evitar confusão entre documentação canônica (`docs/*.md`) e artefatos gerados de diagramas |
| 2026-09-20 | `currentTime` de reprodução NÃO fica em estado do React (nem no Zustand) — só é lido sob demanda de `AudioEngine.getCurrentTime()`, dentro de `requestAnimationFrame` | Evitar 60 re-renders/segundo na árvore inteira; só o playhead (desenho direto no canvas) e o `TimeReadout` (throttled a 1x/segundo) leem esse valor — ver `docs/SPEC.md` §4.3 |
| 2026-09-20 | Paleta definida: fundo quase-preto `#0d0d10`, acento âmbar `#e2a63d` usado só em playhead/estado ativo | Evitar os clichês visuais de UI gerada por IA (terracota `#D97757`, preto puro `#0b0b0b`); acento único mantém o foco na waveform, conforme `docs/SPEC.md` §4.1 |
| 2026-09-20 | Time-stretch com preservação de pitch implementado como OLA simples (overlap-add), não WSOLA completo com alinhamento por correlação cruzada | Entrega a funcionalidade pedida (§4.3) com complexidade administrável; introduz leve "textura"/artefato perceptível em esticamentos extremos (perto de 0.25x ou 2.0x) — WSOLA com correlação é a evolução natural se a qualidade em extremos importar |
| 2026-09-20 | Loop no caminho nativo (`rate === 1`) usa `AudioBufferSourceNode.loop/loopStart/loopEnd` (sample-accurate, nativo do navegador); no caminho com `AudioWorklet` (`rate !== 1`), o loop é reimplementado manualmente dentro do processor | Web Audio não expõe loop nativo pra um `AudioWorkletNode` alimentado por dados brutos — a fonte de verdade da posição (`AudioContext.currentTime`) continua sendo a mesma em ambos os caminhos, então a UI não precisa saber qual caminho está ativo |
| 2026-09-20 | Sem testes automatizados para a lógica de DSP do `AudioWorklet` | `jsdom` (ambiente do Vitest) não implementa Web Audio API/AudioWorklet; validação é manual por ora — testes de navegador (Playwright) ficam como possível item de dívida técnica |
