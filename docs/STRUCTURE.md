# Harmonia — Estrutura de Projeto (Padrão de Mercado)

Este documento substitui a estrutura simplificada de `PROGRESS.md` §1 por uma organização real de monorepo poliglota, agnóstica de framework, com variante com e sem Docker.

---

## 1. Princípios da Estrutura

1. **`apps/` vs `services/` vs `packages/`** — convenção usada por monorepos reais (Turborepo, Nx, Vercel, Shopify, etc.):
   - `apps/` → coisas que um usuário final acessa diretamente (o frontend web).
   - `services/` → processos de backend independentes, cada um deployável sozinho (API gateway, microsserviços de análise).
   - `packages/` → código compartilhado entre apps/services (tipos, contratos de API, config compartilhada) — evita duplicar, por exemplo, a definição de um `ChordEvent` em TypeScript *e* em Python de forma dessincronizada.
2. **Cada serviço segue a convenção idiomática da sua própria linguagem por dentro.** Não forçamos `src/` em tudo artificialmente — um projeto Node usa `src/`, um projeto Python usa layout `src/` de pacote (`pyproject.toml`), um crate Rust usa `src/lib.rs` (é a convenção do Cargo, não uma escolha nossa).
3. **Docker é opcional e isolado.** Nada no código depende de estar em container; os arquivos de Docker ficam em locais previsíveis (`Dockerfile` na raiz de cada serviço + `docker-compose.yml` na raiz do monorepo), e quem não quiser usar Docker roda cada serviço nativamente com os comandos padrão da linguagem.
4. **Documentação, infraestrutura e scripts de automação ficam fora dos serviços**, em pastas de primeiro nível (`docs/`, `infra/`, `scripts/`, `.github/`) — assim uma pessoa nova entende a arquitetura sem precisar entrar em nenhum serviço específico.

---

## 2. Árvore Completa (com suporte a Docker)

```
harmonia/
├── apps/
│   └── web/                          # Frontend — React + TypeScript (Vite)
│       ├── public/                   # assets estáticos servidos diretamente
│       ├── src/
│       │   ├── components/
│       │   ├── features/             # waveform/, upload/, chords/, transport/ — por domínio, não por tipo de arquivo
│       │   ├── hooks/
│       │   ├── lib/                  # cliente de API, wrapper do Web Audio, etc.
│       │   ├── stores/               # estado (Zustand/Redux)
│       │   ├── styles/
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── wasm/                     # binários .wasm compilados, importados pelo app (build artifact de wasm-dsp)
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── .env.example
│       └── Dockerfile                # opcional — build multi-stage (build estático + nginx)
│
├── services/
│   ├── api-gateway/                  # Node — BFF/Auth/orquestração (não faz análise pesada)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── middleware/           # auth, rate-limit, validação
│   │   │   ├── services/             # lógica de negócio (chama storage, queue, db)
│   │   │   ├── websocket/            # push de progresso de análise
│   │   │   ├── config/
│   │   │   └── index.ts
│   │   ├── test/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── .env.example
│   │   └── Dockerfile
│   │
│   ├── analysis-service/             # Python — feature extraction + orquestração dos modelos
│   │   ├── src/
│   │   │   └── analysis_service/     # layout "src" padrão de pacote Python
│   │   │       ├── __init__.py
│   │   │       ├── api/              # FastAPI routers
│   │   │       ├── features/         # CQT, chroma, HPSS (librosa/essentia)
│   │   │       ├── workers/          # consumers da fila de jobs
│   │   │       └── config.py
│   │   ├── tests/
│   │   ├── pyproject.toml            # (ou requirements.txt, se preferir algo mais simples)
│   │   ├── .env.example
│   │   └── Dockerfile
│   │
│   ├── chord-recognition-service/    # Python — modelo de ML dedicado (versionável independente: v1, v2...)
│   │   ├── src/
│   │   │   └── chord_service/
│   │   │       ├── model/            # definição do modelo (CNN/CRNN)
│   │   │       ├── inference/
│   │   │       ├── decoding/         # HMM/CRF de suavização temporal
│   │   │       └── api.py
│   │   ├── models/                   # pesos treinados versionados (ou apontando pra um registry externo)
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   │
│   └── key-tempo-service/            # Python — key signature + BPM (pode nascer dentro de analysis-service
│                                      # e virar serviço próprio depois — ver DECISIONS.md se/quando isso mudar)
│
├── packages/                         # código compartilhado, sem processo próprio
│   ├── api-contracts/                # OpenAPI/schema + tipos gerados (TS) — fonte única de verdade do contrato de API
│   │   ├── openapi.yaml
│   │   └── generated/
│   ├── shared-types/                 # tipos de domínio compartilhados entre frontend e services TS (ChordEvent, etc.)
│   └── eslint-config/                # config de lint compartilhada (opcional, comum em monorepos JS)
│
├── wasm-dsp/                         # Rust — módulo de DSP compilado para WebAssembly
│   ├── src/
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── build.sh                      # wasm-pack build → gera artefato consumido por apps/web/wasm
│
├── infra/                            # Infraestrutura como código (opcional, cresce conforme necessário)
│   ├── terraform/                    # provisionamento de storage, banco, cluster
│   └── k8s/                          # manifests de deploy, se for além de docker-compose
│
├── docs/
│   ├── SPEC.md
│   ├── PROGRESS.md
│   ├── DECISIONS.md
│   └── diagrams/
│
├── scripts/                          # automação de dev (setup local, seed de banco, geração de tipos)
│   ├── setup.sh
│   └── seed-db.sh
│
├── .github/
│   └── workflows/
│       ├── ci.yml                    # lint + test + build em cada push/PR
│       └── deploy.yml
│
├── docker-compose.yml                # orquestra todos os serviços localmente (dev)
├── docker-compose.override.yml       # ajustes locais (hot-reload, volumes) — não versionado ou versionado à parte
├── .env.example                      # variáveis de ambiente da raiz (compartilhadas entre serviços via compose)
├── .gitignore
├── .editorconfig                     # consistência básica entre editores, independente de linguagem
├── Makefile                          # atalhos: make dev / make test / make build (abstrai docker vs. nativo)
├── LICENSE
├── CONTRIBUTING.md
└── README.md                          # visão geral + aponta para docs/SPEC.md e docs/PROGRESS.md
```

---

## 3. Variante Sem Docker

Sem Docker, a estrutura é **idêntica** — só removem-se os `Dockerfile` e os `docker-compose*.yml` da raiz, e o `Makefile`/`scripts/setup.sh` passam a instalar/rodar cada serviço nativamente:

```makefile
# Makefile (exemplo, variante sem Docker)
dev-web:
	cd apps/web && npm run dev

dev-gateway:
	cd services/api-gateway && npm run dev

dev-analysis:
	cd services/analysis-service && uvicorn analysis_service.api:app --reload

dev-wasm:
	cd wasm-dsp && ./build.sh
```

Cada serviço continua **independentemente executável** com os comandos nativos do seu ecossistema (`npm run dev`, `uvicorn ...`, `cargo build`) — isso é o que garante que o projeto "funcione independentemente da tecnologia usada", como você pediu: cada linguagem usa suas próprias ferramentas padrão, e a estrutura de pastas só organiza onde cada coisa mora, sem impor um jeito artificial de rodar.

**Com Docker**, o mesmo `Makefile` viraria:
```makefile
dev:
	docker compose up --build
```
E cada serviço ganha um `Dockerfile` próprio — o `docker-compose.yml` na raiz apenas referencia os `Dockerfile`s de cada `apps/*` e `services/*`, sem duplicar lógica.

---

## 4. Por que essa organização é "de mercado"

| Escolha | Onde se vê isso na prática |
|---|---|
| `apps/` + `services/` + `packages/` | Turborepo, Nx, monorepos da Vercel/Shopify/Google |
| Cada serviço com seu próprio `Dockerfile`, compose só orquestra | Padrão em qualquer monorepo poliglota com múltiplos times/linguagens |
| `packages/api-contracts` como fonte única do contrato de API | Evita o clássico bug de "frontend e backend com tipos dessincronizados"; comum em times que usam OpenAPI/gRPC/tRPC |
| `src/` dentro de cada serviço, no formato idiomático da linguagem | Node/React: convenção de facto; Python: "src layout" recomendado pela própria PyPA; Rust: exigido pelo Cargo |
| `infra/` separado de `services/` | IaC não é código de aplicação — times de plataforma/DevOps mexem ali sem tocar em código de produto |
| `.github/workflows/`, `Makefile`, `.env.example` na raiz | Onboarding de alguém novo: clonar, ler `README.md`, rodar `make dev`, sem precisar perguntar nada a ninguém |

---

## 5. Atualização em `DECISIONS.md`

Registrar esta mudança no log de decisões:

| Data | Decisão | Motivo |
|---|---|---|
| 2026-09-20 | Estrutura de repositório trocada de `frontend/`+`backend/` para monorepo `apps/`+`services/`+`packages/` | Alinhar com convenções reais de monorepos poliglotas; suportar múltiplas linguagens (TS/Python/Rust) sem forçar layout artificial; permitir Docker opcional sem afetar organização de código |

---

## 6. Próximo Passo Sugerido (Fase 0 atualizada)

- [ ] Criar a árvore de pastas acima (vazia, com `.gitkeep` onde necessário)
- [ ] `apps/web`: scaffold Vite + React + TS
- [ ] `services/api-gateway`: scaffold Node com endpoint de health-check
- [ ] `packages/api-contracts`: `openapi.yaml` inicial (mesmo que mínimo, com só `/health`)
- [ ] `docker-compose.yml` mínimo (web + api-gateway) — analysis-service entra na Fase 4
- [ ] `README.md` + `Makefile` com os comandos de dev
