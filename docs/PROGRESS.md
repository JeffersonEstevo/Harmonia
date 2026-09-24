# Harmonia — Plano de Desenvolvimento & Protocolo de Handoff de Contexto

**Propósito deste documento:** ser o "estado atual do projeto" que você mantém atualizado e cola no início de qualquer conversa nova — comigo, com outra LLM, ou com você mesmo daqui a duas semanas — para retomar o trabalho sem perder contexto.

**Como usar este arquivo:**
1. Guarde-o dentro do repositório do projeto, em `/docs/PROGRESS.md`.
2. Depois de cada sessão de desenvolvimento, atualize a seção **"Estado Atual"** (o que mudou, o que falta).
3. No início de uma sessão nova com qualquer LLM, cole o conteúdo da seção **"Prompt de Retomada"** (§3) — ela já contém tudo que a LLM precisa saber.

---

## 1. Estrutura de Repositório Recomendada

A estrutura completa (monorepo poliglota `apps/` + `services/` + `packages/`, com variantes com e sem Docker) está detalhada em **`docs/STRUCTURE.md`** — consulte esse arquivo antes de gerar qualquer scaffold. Resumo:

```
harmonia/
├── apps/web/              # Frontend — React + TS
├── services/
│   ├── api-gateway/       # Node — BFF/Auth/orquestração
│   ├── analysis-service/  # Python — feature extraction
│   ├── chord-recognition-service/  # Python — modelo de ML de acordes
│   └── key-tempo-service/ # Python — key/BPM
├── packages/
│   ├── api-contracts/     # OpenAPI + tipos compartilhados
│   └── shared-types/
├── wasm-dsp/               # Rust — DSP compilado para WASM
├── infra/                  # Terraform/k8s (opcional)
├── docs/                   # SPEC.md, PROGRESS.md (este arquivo), DECISIONS.md, STRUCTURE.md
├── scripts/
├── docker-compose.yml      # opcional
└── README.md
```

**Por que separar `DECISIONS.md` de `PROGRESS.md`:** `PROGRESS.md` responde "onde estamos"; `DECISIONS.md` responde "por que escolhemos X e não Y" (ex: "escolhemos WaveSurfer.js customizado em vez de renderer 100% próprio, porque X"). Isso evita que uma LLM nova proponha refazer uma decisão já tomada e justificada.

---

## 2. Roadmap Detalhado — Fases e Tarefas Granulares

Cada fase é pensada para ser pedida a uma LLM em pedaços pequenos (uma tarefa = um prompt = um commit). Marque `[x]` conforme for concluindo.

### Fase 0 — Setup do Projeto
- [x] Estrutura de pastas de `docs/STRUCTURE.md` criada (`apps/`, `services/`, `packages/`, etc.) — falta apenas `git init` + primeiro commit
- [x] Scaffold de `apps/web` (Vite + React + TypeScript) — builda e roda (`npm run build` / `npm run dev`)
- [x] Scaffold de `services/api-gateway` (Node + Express + TS, endpoint `/health` real, com teste via Vitest/Supertest passando)
- [x] `packages/api-contracts`: `openapi.yaml` inicial (mínimo, com `/health`)
- [x] Lint/format configurados: ESLint compartilhado (`packages/eslint-config`) + Prettier na raiz; `.github/workflows/ci.yml` com install → lint → test → build
- [x] `docker-compose.yml` mínimo (web + api-gateway) — opcional, ver §3 de `STRUCTURE.md` para variante sem Docker
- [x] `README.md` + `Makefile` com instruções/atalhos de setup local (com e sem Docker)

### Fase 1 — Upload & Waveform (sem análise ainda)
- [x] Componente de upload drag-and-drop + fallback de input nativo
- [x] Validação client-side (tipo de arquivo, tamanho, sniff de magic bytes)
- [x] Decodificação do áudio via Web Audio API (`AudioContext.decodeAudioData`)
- [x] Renderer de waveform em Canvas (peaks min/max, zoom básico)
- [x] Transporte básico: play/pause/stop sincronizado ao `AudioContext.currentTime`
- [x] Scrub por clique/arraste na waveform
- [x] Layout responsivo do shell da aplicação (desktop/tablet/mobile)

### Fase 2 — Waveform Avançada
- [x] Zoom contínuo (scroll/pinch) com pirâmide de resolução de peaks
- [x] Minimap/overview além da waveform principal
- [x] Loop regions (definir, arrastar, redimensionar; snap a beat grid quando existir — snap fica pra Fase 3, quando a beat grid existir)
- [x] Velocidade de reprodução variável com preservação de pitch (`AudioWorklet` + OLA)
- [x] Atalhos de teclado (space, J/K/L, +/-, além de I/O pra loop)

### Fase 3 — Análise Tier 1 (client-side, WASM)
- [x] Módulo WASM: FFT/chroma (AssemblyScript, não Rust/C++ — ver DECISIONS.md)
- [x] Integração do WASM num Web Worker (não trava a main thread)
- [x] Detector simples de onset/BPM client-side
- [x] Classificador Tier 1 de acordes (maior/menor/7ª dominante) — template matching por chroma
- [x] Overlay de acordes na waveform (blocos coloridos, onset/offset)
- [x] Overlay de beat grid

### Fase 4 — Backend de Análise (Tier 2, Python)
- [ ] Upload para storage (S3-compatible), URLs assinadas
- [ ] Fila de jobs (Redis Streams é o mais simples pra começar)
- [ ] Microsserviço de feature extraction (librosa/essentia: CQT, HPSS)
- [ ] Microsserviço de reconhecimento de acordes (modelo CNN/CRNN + decodificação HMM)
- [ ] Microsserviço de key/tempo (Krumhansl-Schmuckler ou modelo treinado + DBN beat tracker)
- [ ] WebSocket para stream de progresso/resultados ao client
- [ ] Refinamento in-place do overlay (Tier 1 → Tier 2 sem "pulo" visual)

### Fase 5 — Contas & Persistência
- [ ] Auth (OAuth2/OIDC — Google/Apple + email/senha)
- [ ] Banco relacional (Postgres): users, tracks, analyses, chord_events, key_segments
- [ ] Biblioteca do usuário (listar/renomear/organizar faixas salvas)
- [ ] Política de retenção para uploads anônimos (purge automático)

### Fase 6 — Export & Compartilhamento
- [ ] Export de chord chart em PDF
- [ ] Export de imagem anotada da waveform (PNG/SVG)
- [ ] Export JSON/CSV estruturado
- [ ] Links de compartilhamento (read-only, com controle de visibilidade)

### Fase 7 — Análise Avançada (stretch)
- [ ] Segmentação estrutural (intro/verso/refrão)
- [ ] Contorno melódico (pitch tracking monofônico)
- [ ] Índice de complexidade rítmica

---

## 3. Prompt de Retomada (cole isto no início de qualquer conversa nova)

```
Estou desenvolvendo o "Harmonia", um app web de análise musical (waveform interativa +
reconhecimento de acordes/tempo/tom). A especificação técnica completa está no documento
SPEC.md do projeto [cole aqui o link do artifact ou anexe o arquivo].

STACK: React+TS (frontend), Node (API gateway), Python/FastAPI (microsserviços de análise:
librosa/essentia/madmom + modelo de ML para acordes), WASM (Rust/C++) para análise client-side
rápida, Postgres, Redis, storage S3-compatible.

ESTÁGIO ATUAL: Fase [X] — [nome da fase]
ÚLTIMA TAREFA CONCLUÍDA: [descreva]
PRÓXIMA TAREFA: [cole a tarefa específica do checklist, ex: "Implementar o renderer de
waveform em Canvas com peaks min/max"]

DECISÕES JÁ TOMADAS (não reabrir sem motivo forte):
- [cole aqui os itens relevantes do DECISIONS.md]

Preciso do código para a PRÓXIMA TAREFA acima, consistente com o que já existe no repositório
(vou colar os arquivos relevantes a seguir / estão anexados).
```

Preencha os colchetes antes de colar. Quanto mais específica a "PRÓXIMA TAREFA", melhor — uma LLM nova produz código muito mais útil recebendo "implemente X" do que "continue o projeto".

---

## 4. Estado Atual do Projeto

> **Atualize esta seção a cada sessão.** É a parte que realmente muda com o tempo.

- **Fase atual:** Fase 3 concluída — pronta para Fase 4
- **Última tarefa concluída:** Módulo `wasm-dsp` (AssemblyScript → `.wasm` real): FFT, chromagram (mapeamento de bins pra classes de altura), detecção de onset (spectral flux) e estimativa de tempo (autocorrelação), classificador de acordes por template matching (36 templates: 12 fundamentais × maior/menor/7ª dominante). Roda num Web Worker dedicado (`public/workers/analysis-worker.js`), disparado automaticamente após o carregamento da faixa. Suavização por filtro de moda + codificação em segmentos (substitui o HMM da Camada 2, que é server-side). Overlay de acordes (faixa colorida sob a waveform) e grade de batida (marcações finas) integrados ao `WaveformCanvas`. 5/5 testes de sanidade da DSP com áudio sintético passando (seno puro → chroma correto, acordes C e Am reconhecidos, silêncio → nenhum acorde, cliques a 120 BPM → tempo estimado correto), 17 testes automatizados do app + 1 do gateway passando, lint e build limpos.
- **Próxima tarefa:** Fase 4 — microsserviços Python (`analysis-service`, `chord-recognition-service`, `key-tempo-service`): extração de features via librosa/essentia, modelo de ML pra vocabulário estendido de acordes/inversões, fila de jobs, WebSocket de progresso
- **Bloqueios/pendências:** nenhum novo. Segue valendo a nota da Fase 2 sobre `AudioWorklet` sem cobertura automatizada. Nota nova: os testes de sanidade da DSP (`wasm-dsp/smoke-test.mjs`) rodam via `node`, fora do `npm test` do monorepo (Vitest/jsdom não executam WASM+ESM do mesmo jeito) — rodar manualmente com `cd wasm-dsp && npm run smoke-test` após qualquer mudança na DSP
- **Última atualização:** 2026-09-22

---

## 5. Log de Decisões (DECISIONS.md — pode ficar aqui ou em arquivo separado)

| Data | Decisão | Motivo |
|---|---|---|
| 2026-09-20 | Especificação técnica aprovada (ver SPEC.md) | Baseline do projeto |
| 2026-09-20 | Estrutura de repositório trocada de `frontend/`+`backend/` para monorepo `apps/`+`services/`+`packages/` (ver STRUCTURE.md) | Alinhar com convenções reais de monorepos poliglotas; suportar TS/Python/Rust sem layout artificial; Docker opcional |

*(conforme decisões forem tomadas durante o desenvolvimento — ex: "escolhemos WaveSurfer.js vs renderer próprio", "escolhemos modelo X para reconhecimento de acordes" — registre aqui com a justificativa.)*

---

## 6. Dicas Práticas para Trabalhar com Múltiplas LLMs

- **Peça uma tarefa por vez.** "Implemente a Fase 3 inteira" produz código difícil de revisar e integrar. "Implemente só o detector de onset client-side" produz algo testável.
- **Sempre cole (ou anexe) os arquivos existentes relevantes**, não só a spec — LLMs não veem seu repositório sozinhas.
- **Depois de aceitar um código, atualize `PROGRESS.md` e `DECISIONS.md` imediatamente**, antes de fechar a sessão — é o passo que mais gente pula e é o que quebra a continuidade.
- **Use commits pequenos e mensagens descritivas** (`feat: waveform canvas renderer with min/max peaks`) — isso vira contexto extra que qualquer LLM consegue ler direto do `git log`.
- **Se possível, use uma ferramenta agente que leia o repo diretamente** (Claude Code, Cursor, etc.) para as fases de implementação mais pesadas — elas leem `PROGRESS.md`/`DECISIONS.md`/o código automaticamente, reduzindo a necessidade de copiar/colar contexto manualmente.
