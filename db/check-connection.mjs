#!/usr/bin/env node
// Neon(Postgres) に正しくつながるかだけを確認する読み取り専用スクリプト。
// vercel dev は不要。これで「接続文字列が正しいか」「テーブルが作れているか」を確認できる。
//
// 使い方（プロジェクト直下で）:
//   1) 初回のみ:  cd api && npm install   （@neondatabase/serverless を入れる）
//   2) 接続文字列をセット:
//        Windows PowerShell:  $env:DATABASE_URL="postgres://....（Neonでコピーした文字列）"
//        Mac/Linux:           export DATABASE_URL="postgres://...."
//   3) 実行:  node db/check-connection.mjs

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromApi = createRequire(new URL("../api/package.json", import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL が設定されていません。");
  console.error("   接続文字列をセットしてから、もう一度実行してください（このファイル冒頭の手順参照）。");
  process.exit(1);
}

let neon;
try {
  ({ neon } = requireFromApi("@neondatabase/serverless"));
} catch {
  console.error("❌ @neondatabase/serverless が見つかりません。先に `cd api && npm install` を実行してください。");
  process.exit(1);
}

const sql = neon(url);

try {
  // 1. つながるか
  await sql`SELECT 1`;
  console.log("✅ Neonへの接続に成功しました。");

  // 2. テーブルがあるか＆件数
  const rows = await sql`SELECT count(*)::int AS count FROM character_master`;
  const count = rows[0].count;
  if (count > 0) {
    console.log(`✅ character_master に ${count} 文字が登録されています。準備完了です！`);
  } else {
    console.log("⚠️  接続はできましたが、character_master が空です。");
    console.log("   → NeonのSQL Editorで db/setup_all.sql を貼り付けて Run してください。");
  }
} catch (e) {
  const msg = String(e);
  if (msg.includes("character_master") || msg.includes("does not exist")) {
    console.error("⚠️  接続はできましたが、テーブル character_master がありません。");
    console.error("   → NeonのSQL Editorで db/setup_all.sql を貼り付けて Run してください。");
  } else {
    console.error("❌ 接続に失敗しました。接続文字列（DATABASE_URL）が正しいか確認してください。");
    console.error("   詳細:", msg);
  }
  process.exit(1);
}
