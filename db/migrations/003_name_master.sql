-- 003_name_master.sql
-- Phase2（ペット命名提案）の候補マスタ。
-- targets/genders/categories は配列（text[]）で保持する（正規化テーブルは将来必要になったら）。

CREATE TABLE IF NOT EXISTS name_master (
  name_id    SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  reading    TEXT NOT NULL,
  char_type  TEXT NOT NULL CHECK (char_type IN ('hiragana','katakana','kanji')),
  targets    TEXT[] NOT NULL,   -- dog / cat / small
  genders    TEXT[] NOT NULL,   -- male / female / neutral
  categories TEXT[] NOT NULL
);
