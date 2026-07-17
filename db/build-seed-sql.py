#!/usr/bin/env python3
"""character_master.seed.json から 002_seed_character_master.sql を生成する。

シードの唯一の正は db/seed/character_master.seed.json。
このスクリプトはビルド時のみ使用し、本番の実行時には呼び出さない（T-003 の方針）。

使い方:
    python3 db/build-seed-sql.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "db", "seed", "character_master.seed.json")
OUT = os.path.join(ROOT, "db", "migrations", "002_seed_character_master.sql")


def esc(s: str) -> str:
    return s.replace("'", "''")


def main() -> None:
    rows = json.load(open(SEED, encoding="utf-8"))
    lines = [
        "-- 002_seed_character_master.sql（db/seed/character_master.seed.json から生成）",
        "-- 生成元スクリプト: db/build-seed-sql.py",
        "INSERT INTO character_master (character, stroke_count, character_type, source) VALUES",
    ]
    vals = [
        f"('{esc(r['character'])}', {r['stroke_count']}, "
        f"'{r['character_type']}', '{r['source']}')"
        for r in rows
    ]
    lines.append(",\n".join(vals) + "\nON CONFLICT (character) DO NOTHING;")
    open(OUT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"generated {OUT} ({len(vals)} rows)")


if __name__ == "__main__":
    main()
