// ペット名候補マスタ（name_master）の参照（Phase2・F-002）。
// Phase1 の character_master と同様、まず seed JSON をメモリ参照する。
// 将来は Neon の name_master テーブルに置き換え可能な構造にしておく。

import seed from "../../../db/seed/name_master.seed.json";

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

const CANDIDATES: NameCandidate[] = seed as NameCandidate[];

/** すべての候補（読み取り専用）。 */
export function allCandidates(): NameCandidate[] {
  return CANDIDATES;
}

/** 利用可能なカテゴリ一覧（重複排除）。画面のカテゴリ選択に使う。 */
export function allCategories(): string[] {
  const set = new Set<string>();
  for (const c of CANDIDATES) for (const cat of c.categories) set.add(cat);
  return Array.from(set);
}
