-- Fase 6 — links de compartilhamento. A tabela share_links já existia (001)
-- só como schema; aqui entram as colunas que o recurso realmente precisa.

ALTER TABLE share_links
    -- por padrão o link expõe só a ANÁLISE; ouvir o áudio é opt-in do dono
    -- (docs/SPEC.md §9 — risco de redistribuição de música protegida)
    ADD COLUMN allow_audio BOOLEAN NOT NULL DEFAULT false,
    -- envelope da waveform (pares min/max, ~1000 buckets) — não permite
    -- reconstruir o áudio, só desenhar o formato de onda sem expor o arquivo
    ADD COLUMN peaks JSONB,
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
