# analysis-service

Camada 2 (Tier 2) de análise — acordes, tonalidade e tempo com muito mais
precisão que o Nível 1 (client-side/WASM), usando **essentia** (HPCP +
`ChordsDetection` + `KeyExtractor` + `RhythmExtractor2013`) em vez de um
modelo treinado do zero. Ver `docs/DECISIONS.md` pelo raciocínio completo
(por que essentia e não madmom, por que um único serviço em vez de três,
por que sem fila externa ainda).

## Rodando localmente (sem Docker)

```bash
python3 -m venv .venv
. .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -e .
uvicorn analysis_service.api.main:app --reload --port 8001
```

## Testes

```bash
pip install pytest
pytest tests/ -v
```

Os testes usam áudio sintético com harmônicos realistas (não senoides puras)
— incluindo a progressão Bm-G-D-A que motivou esta fase — pra validar que o
pipeline reconhece corretamente antes de qualquer integração com a UI.

## API

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/analyze` | Recebe um arquivo de áudio (`multipart/form-data`, campo `file`), retorna `{ job_id }` |
| `GET` | `/jobs/{job_id}` | Polling do status/resultado do job |
| `WS` | `/ws/jobs/{job_id}` | Push do resultado assim que o job terminar |

## Limitações conhecidas desta fase

- Processamento roda num `ThreadPoolExecutor` in-process, não numa fila
  externa (Redis Streams/Kafka) — não escala horizontalmente ainda. Migrar
  pra fila de verdade faz sentido quando houver um banco de dados (Fase 5)
  pra guardar o estado dos jobs de forma persistente.
- Sem armazenamento em object storage (S3) — o áudio chega via upload
  HTTP direto e não é persistido, só processado em memória.
