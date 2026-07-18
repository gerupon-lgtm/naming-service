-- 001_character_master.sql
-- Phase1（MVP）で必要な唯一のテーブル。
-- 診断結果は永続化しない。書き込みは「未知文字の kanjiapi.dev キャッシュ」のみ（source='kanjiapi'）。

CREATE TABLE IF NOT EXISTS character_master (
  character_id   SERIAL PRIMARY KEY,
  character      TEXT NOT NULL UNIQUE,           -- 1文字
  stroke_count   INTEGER NOT NULL CHECK (stroke_count > 0),
  character_type TEXT NOT NULL
                 CHECK (character_type IN ('kanji','hiragana','katakana','roman','symbol')),
  source         TEXT NOT NULL DEFAULT 'seed'
                 CHECK (source IN ('seed','kanjiapi'))
);

CREATE INDEX IF NOT EXISTS idx_character_master_character
  ON character_master (character);
