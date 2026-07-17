// ペット名候補マスタ（name_master）の参照（Phase2・F-002）。
// DATABASE_URL があれば Neon の name_master テーブルから読む。
// 未設定・テーブル未作成・障害時は同梱の seed JSON にフォールバックする。

import seed from "../../../db/seed/name_master.seed.json";
import { isDbEnabled, dbGetNameMaster } from "../db";

export type PetTarget = "dog" | "cat" | "small";
export type PetGender = "male" | "female" | "neutral";
export type NameType = "hiragana" | "katakana" | "kanji";

export interface NameCandidate {
  name: string;
  reading: string;
  type: NameType;
  targets: PetTarget[];
  genders: PetGender[];
  categories: string[];
}

const SEED: NameCandidate[] = seed as NameCandidate[];

// DB読み込みは1回だけ（コールドスタートごと）にキャッシュ。
let _cache: Promise<NameCandidate[]> | null = null;

/** ペット名候補の一覧（DB優先・seedフォールバック）。 */
export async function getCandidates(): Promise<NameCandidate[]> {
  if (!isDbEnabled()) return SEED;
  if (!_cache) {
    _cache = (async () => {
      const rows = await dbGetNameMaster();
      return rows.length > 0 ? (rows as NameCandidate[]) : SEED;
    })();
  }
  return _cache;
}

/** 利用可能なカテゴリ一覧（重複排除）。画面のカテゴリ選択に使う。 */
export async function getAllCategories(): Promise<string[]> {
  const cands = await getCandidates();
  const set = new Set<string>();
  for (const c of cands) for (const cat of c.categories) set.add(cat);
  return Array.from(set);
}

/** seed のみの同期取得（テスト・件数確認用）。 */
export function seedCandidates(): NameCandidate[] {
  return SEED;
}
