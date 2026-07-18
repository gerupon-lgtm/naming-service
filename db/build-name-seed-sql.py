#!/usr/bin/env python3
"""name_master.seed.json から 004_seed_name_master.sql を生成する。

シードの正は db/seed/name_master.seed.json。ビルド時のみ使用。
使い方: python3 db/build-name-seed-sql.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "db", "seed", "name_master.seed.json")
OUT = os.path.join(ROOT, "db", "migrations", "004_seed_name_master.sql")


def esc(s: str) -> str:
    return s.replace("'", "''")


def arr(xs) -> str:
    return "ARRAY[" + ", ".join(f"'{esc(x)}'" for x in xs) + "]"


def main() -> None:
    rows = json.load(open(SEED, encoding="utf-8"))
    lines = [
        "-- 004_seed_name_master.sql（db/seed/name_master.seed.json から生成）",
        "-- 生成元: db/build-name-seed-sql.py",
        "INSERT INTO name_master (name, reading, char_type, targets, genders, categories) VALUES",
    ]
    vals = [
        f"('{esc(r['name'])}', '{esc(r['reading'])}', '{r['type']}', "
        f"{arr(r['targets'])}, {arr(r['genders'])}, {arr(r['categories'])})"
        for r in rows
    ]
    upsert = (
        "\nON CONFLICT (name) DO UPDATE SET\n"
        "  reading = EXCLUDED.reading,\n"
        "  char_type = EXCLUDED.char_type,\n"
        "  targets = EXCLUDED.targets,\n"
        "  genders = EXCLUDED.genders,\n"
        "  categories = EXCLUDED.categories;"
    )
    lines.append(",\n".join(vals) + upsert)
    open(OUT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"generated {OUT} ({len(vals)} rows)")


if __name__ == "__main__":
    main()
