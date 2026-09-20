# Harmonia

Plataforma web de análise musical de alta precisão (waveform interativa +
reconhecimento de acordes, tempo e tonalidade).

## Documentação

- [`docs/SPEC.md`](docs/SPEC.md) — especificação funcional/técnica completa
- [`docs/STRUCTURE.md`](docs/STRUCTURE.md) — estrutura de pastas e convenções do repositório
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — estado atual do projeto e roadmap por fases
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decisões técnicas registradas (ADR)

## Setup local

Requisitos: Node 22+, npm 10+. Docker é opcional (ver `docs/STRUCTURE.md` §3).

```bash
npm install
```

### Com Docker

```bash
make dev
# web:         http://localhost:5173
# api-gateway: http://localhost:4000/health
```

### Sem Docker

```bash
# terminal 1
make dev-gateway   # http://localhost:4000/health

# terminal 2
make dev-web       # http://localhost:5173
```

## Comandos úteis

| Comando | O que faz |
|---|---|
| `make lint` | Roda o ESLint em todos os workspaces |
| `make test` | Roda os testes de todos os workspaces |
| `make build` | Builda todos os workspaces |

## Estrutura

Monorepo `apps/` + `services/` + `packages/` — ver `docs/STRUCTURE.md` para o
racional completo e a árvore de pastas por extenso.
