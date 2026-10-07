-- Migração inicial — ver docs/SPEC.md §6.5 (modelo de dados) e docs/DECISIONS.md
-- pelas adaptações feitas aqui em relação ao diagrama original.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- pra gen_random_uuid()

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT,                -- NULL se a conta é só OAuth (sem senha local)
    display_name    TEXT NOT NULL,
    oauth_provider  TEXT,                -- 'google', futuramente 'apple' — NULL se é login por senha
    oauth_subject   TEXT,                -- id do usuário no provedor OAuth
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (oauth_provider, oauth_subject)
);

CREATE TABLE tracks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    storage_path    TEXT NOT NULL,       -- caminho local em disco por ora — ver docs/DECISIONS.md (sem S3 ainda)
    duration_sec    REAL NOT NULL,
    original_format TEXT NOT NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    visibility      TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public'))
);

CREATE INDEX idx_tracks_owner_id ON tracks(owner_id);

CREATE TABLE analyses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id        UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    model_version   TEXT NOT NULL,       -- ex.: 'tier1-wasm-v1', 'tier2-essentia-v1'
    status          TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('processing', 'done', 'error')),
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analyses_track_id ON analyses(track_id);

CREATE TABLE chord_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id     UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    chord_symbol    TEXT NOT NULL,       -- ex.: 'Bm', 'G', 'D7' — já no formato final exibido
    onset_sec       REAL NOT NULL,
    offset_sec      REAL NOT NULL,
    confidence      REAL NOT NULL DEFAULT 1.0
);

CREATE INDEX idx_chord_events_analysis_id ON chord_events(analysis_id);

CREATE TABLE key_segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id     UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    key_name        TEXT NOT NULL,       -- ex.: 'D', 'A'
    scale           TEXT,                -- 'major' | 'minor'
    onset_sec       REAL NOT NULL DEFAULT 0,
    offset_sec      REAL,                -- NULL = até o fim da faixa (sem modulação detectada)
    confidence      REAL NOT NULL DEFAULT 1.0
);

CREATE INDEX idx_key_segments_analysis_id ON key_segments(analysis_id);

CREATE TABLE tempo_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id     UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    bpm             REAL,
    time_signature  TEXT,
    beat_grid       JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_tempo_profiles_analysis_id ON tempo_profiles(analysis_id);

-- Schema pronto para a Fase 6 (Exportação & Compartilhamento) — tabela
-- criada agora, endpoints/funcionalidade ficam pra lá.
CREATE TABLE share_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id        UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    token           TEXT UNIQUE NOT NULL,
    visibility      TEXT NOT NULL DEFAULT 'unlisted' CHECK (visibility IN ('unlisted', 'public')),
    expires_at      TIMESTAMPTZ
);

CREATE INDEX idx_share_links_token ON share_links(token);
