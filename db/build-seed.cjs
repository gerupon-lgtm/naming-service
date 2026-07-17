#!/usr/bin/env node
/**
 * character_master.seed.json を「本格的に」生成する（T-003本体）。
 *
 * データ源（すべてオフライン・外部APIキー不要）:
 *   - kanji-data : 常用/人名用漢字の一覧と現代画数（KanjiDic2由来）
 *   - kanji      : 漢字の部品分解ツリー（kanjiTree）で部首を検出
 *
 * 熊崎式の部首補正: 分解ツリーに現れる部首グリフを検出し、
 * 「部首→補正値」（下記 CORRECTIONS）を現代画数に加算する。
 * ひらがな・カタカナは既存シードの値を引き継ぐ。
 *
 * 実行:
 *   1) 依存を入れる: npm i kanji-data kanji
 *   2) 実行:        node db/build-seed.cjs
 *      （kanji-data/kanji が別の場所にある場合は NODE_PATH で解決）
 * 生成物:
 *   - db/seed/character_master.seed.json（本体）
 *   - db/seed/correction_review.json（補正を適用した文字の監査用リスト）
 *   - db/migrations/002_seed_character_master.sql / db/setup_all.sql（再生成）
 *
 * 限界（設計どおり許容）:
 *   - 月(肉づき) は「月(つき)」と字形が同じで自動判別できないため補正しない（手動確認対象）。
 *   - 分解ツリーが 廿 を 艹 と誤ラベルする等の稀な誤検出は残る。runtime の kanjiapi.dev
 *     フォールバックは補正なし画数のため、重要文字はここで補正済みにしておく意義がある。
 */
const fs = require("fs");
const path = require("path");

const kd = require("kanji-data");
const api = kd.default || kd;
const k = require("kanji");

const ROOT = path.dirname(__dirname);
const SEED_JSON = path.join(ROOT, "db", "seed", "character_master.seed.json");
const REVIEW_JSON = path.join(ROOT, "db", "seed", "correction_review.json");

// 熊崎式 部首補正: 分解グリフ → 加算画数（＝熊崎値 − 現代画数）。
const CORRECTIONS = {
  "氵": 1, // 水4
  "扌": 1, // 手4
  "艹": 3, // 艸6
  "忄": 1, // 心4
  "⺨": 1, // 犬4（けものへん）
  "⻖": 5, // 阜8（左阝）
  "⻏": 4, // 邑7（右阝）
  "王": 1, // 玉5（玉偏）
  "礻": 1, // 示5
  "衤": 1, // 衣6
  "⻌": 4, // 辵7（しんにょう）
};

function descendants(node, acc) {
  if (node && node.g) {
    for (const c of node.g) {
      if (c.element) acc.push(c.element);
      descendants(c, acc);
    }
  }
  return acc;
}

// 収録対象: 常用漢字（grade 1〜8）＋人名用漢字（grade 9〜10）
const GRADES = [1, 2, 3, 4, 5, 6, 8, 9, 10];
const targetChars = new Set();
for (const g of GRADES) {
  let list = [];
  try {
    list = api.getGrade(g) || [];
  } catch {
    list = [];
  }
  for (const item of list) {
    const ch = typeof item === "string" ? item : item.kanji;
    if (ch) targetChars.add(ch);
  }
}

const review = [];
const kanjiRows = [];
for (const ch of targetChars) {
  const info = api.get(ch);
  if (!info || typeof info.stroke_count !== "number") continue;
  const modern = info.stroke_count;

  let tree;
  try {
    tree = k.kanjiTree(ch);
  } catch {
    tree = null;
  }
  const parts = tree ? descendants(tree, []) : [];

  let delta = 0;
  const applied = [];
  for (const p of parts) {
    if (CORRECTIONS[p]) {
      delta += CORRECTIONS[p];
      applied.push(p);
    }
  }
  const strokes = modern + delta;
  const row = { character: ch, stroke_count: strokes, character_type: "kanji", source: "seed" };
  if (delta > 0) {
    row.note = `熊崎式補正 ${applied.join("+")}（現代${modern}→${strokes}）`;
    review.push({ character: ch, modern, corrected: strokes, radicals: applied });
  }
  kanjiRows.push(row);
}

// ひらがな・カタカナは既存シードから引き継ぐ
const prev = JSON.parse(fs.readFileSync(SEED_JSON, "utf-8"));
const kana = prev.filter(
  (r) => r.character_type === "hiragana" || r.character_type === "katakana"
);

// マージ（同一文字は漢字生成を優先、次に既存）
const map = new Map();
for (const r of kana) map.set(r.character, r);
for (const r of kanjiRows) map.set(r.character, r);
const rows = Array.from(map.values());

fs.writeFileSync(SEED_JSON, JSON.stringify(rows, null, 2) + "\n");
fs.writeFileSync(REVIEW_JSON, JSON.stringify(review, null, 2) + "\n");

console.log(
  `seed生成: 合計 ${rows.length}字（漢字 ${kanjiRows.length} / かな ${kana.length}）、補正適用 ${review.length}字`
);
