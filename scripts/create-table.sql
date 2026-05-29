-- Execute este SQL no painel do Supabase → SQL Editor → New Query
-- Depois clique em RUN

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',
  category      TEXT DEFAULT '',
  sex           TEXT DEFAULT 'Menina',
  price         NUMERIC DEFAULT 0,
  price_display TEXT DEFAULT '',
  size          TEXT DEFAULT '',
  weight        TEXT DEFAULT '',
  body_type     TEXT DEFAULT 'pano',
  eyes          TEXT DEFAULT 'abertos',
  hair          TEXT DEFAULT 'pintado',
  material      TEXT DEFAULT '',
  description   TEXT DEFAULT '',
  includes      TEXT DEFAULT '',
  notes         TEXT DEFAULT '',
  photo         TEXT DEFAULT '',
  available     BOOLEAN DEFAULT true,
  ready_stock   BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Desabilita RLS — acesso controlado pelo service_role do servidor
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
