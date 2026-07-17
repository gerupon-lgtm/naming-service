#!/usr/bin/env node
// Neon(Postgres) へマイグレーション＆シードを流し込むスクリプト（任意・コマンド派向け）。
//
// 使い方:
//   1) 依存を入れる:  cd api && npm install
//   2) 接続文字列を環境変数に:  export DATABASE_URL="postgres://...."   (Windows PowerShell: $env:DATABASE_URL="...")
//   3) 実行:  node db/migrate.mjs
//
// ブラウザ（Neon SQL Editor）派の人は db/setup_all.sql を貼り付けるだけでOK。本スクリプトは不要。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
// @neondatabase/serverless は api/ に入っている。api/ を基点に解決する。
const requireFromApi = createRequire(new URL("../api/package.json", import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("エラー: 環境変数 DATABASE_URL が設定されていません。");
  console.error('例: export DATABASE_URL="postgres://user:pass@host/db?sslmode=require"');
  process.exit(1);
}

const files = [
  "migrations/001_character_master.sql",
  "migrations/002_seed_character_master.sql",
];

let neon;
try {
  ({ neon } = requireFromApi("@neondatabase/serverless"));
} catch {
  console.error(
    "エラー: @neondatabase/serverless が見つかりません。先に `cd api && npm install` を実行してください。"
  );
  process.exit(1);
}

const sql = neon(DATABASE_URL);

for (const rel of files) {
  const path = join(__dirname, rel);
  const text = readFileSync(path, "utf-8");
  // "--" 行コメントを除去し、";" で文を分割して順に実行する
  const statements = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await sql.query(stmt);
  }
  console.log(`✓ 適用: ${rel}（${statements.length} 文）`);
}

const [{ count }] = await sql`SELECT count(*)::int AS count FROM character_master`;
console.log(`完了: character_master に ${count} 文字が登録されています。`);
