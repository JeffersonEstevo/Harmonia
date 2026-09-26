# essentia publica wheel apenas pra tags cp3xx específicas (manylinux) —
# fixar a versão do Python aqui não é opcional, ver docs/DECISIONS.md.
FROM python:3.12-slim

WORKDIR /app

# libsndfile é necessário em runtime pelo soundfile (decodificação de áudio,
# incluindo MP3 — testado com libsndfile 1.2+)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/analysis-service/pyproject.toml ./
COPY services/analysis-service/src ./src
RUN pip install --no-cache-dir -e .

EXPOSE 8001
CMD ["uvicorn", "analysis_service.api.main:app", "--host", "0.0.0.0", "--port", "8001"]
