# Log de Decisões Técnicas (ADR — Architecture Decision Records)

Registro de decisões técnicas relevantes do projeto, com data e motivo. Consulte antes de propor mudanças a algo já decidido aqui.

| Data | Decisão | Motivo |
|---|---|---|
| 2026-09-20 | Especificação técnica aprovada (ver `docs/SPEC.md`) | Baseline funcional/técnico do projeto |
| 2026-09-20 | Estrutura de repositório definida como monorepo `apps/` + `services/` + `packages/` (ver `docs/STRUCTURE.md`) | Alinhar com convenções reais de monorepos poliglotas (Turborepo/Nx-style); suportar TS/Python/Rust sem layout artificial; Docker opcional, não obrigatório |
| 2026-09-20 | `docs/diagrams/` reservado apenas para exports estáticos de diagramas (imagens/SVG), não para documentação em Markdown | Evitar confusão entre documentação canônica (`docs/*.md`) e artefatos gerados de diagramas |
