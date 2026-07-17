// ペット命名候補の提案（Phase2・F-002〜F-005）。
//
// 苗字がないため姓名判断は「地格＝総格（名前の合計画数）」のみで評価する。
// 合成スコア = 画数の吉凶 ＋ 性別一致（重み大）＋ カテゴリ一致。
// マスタ候補が少ない場合は、希望よみから動的にかな候補を補完する（マスタ→動的）。

import {
  allCandidates,
  type NameCandidate,
  type PetTarget,
  type PetGender,
  type NameType,
} from "./nameMaster";
import { lookupStrokes, type LookupDeps } from "../characterMaster";
import { evaluateStroke, CATEGORY_LABEL, type FortuneCategory } from "../fortune";

export interface SuggestInput {
  target: PetTarget;
  sex?: PetGender; // male / female（未指定可）
  categories?: string[]; // 希望カテゴリ（OR一致でスコア加点）
  includeChars?: string[]; // 使いたい文字（AND・すべて含む）
  charTypes?: NameType[]; // 出力文字種の許可リスト（未指定なら全許可）
  reading?: string; // 希望よみ（動的補完に使用）
  limit?: number; // 返す件数（既定20）
  lookup?: LookupDeps; // 画数参照の依存差し替え（テスト用）
}

export interface SuggestItem {
  name: string;
  reading: string;
  type: NameType;
  strokeTotal: number; // 地格＝総格
  fortune: FortuneCategory; // 画数の吉凶
  fortuneLabel: string; // 大吉 等
  score: number; // 合成スコア 0〜100
  source: "master" | "dynamic";
  reasons: string[]; // 推薦理由（性別一致・カテゴリ一致 等）
}

export class SuggestInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuggestInvalidError";
  }
}

/** 合成スコアの重み（性別を特に重視）。調整可能な設定値。 */
export const SUGGEST_WEIGHTS = {
  gender: 0.4,
  stroke: 0.35,
  category: 0.25,
} as const;

const HIRA_MIN = 0x3041;
const HIRA_MAX = 0x3096;

/** ひらがな→カタカナ変換。 */
function toKatakana(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    out +=
      code >= HIRA_MIN && code <= HIRA_MAX
        ? String.fromCodePoint(code + 0x60)
        : ch;
  }
  return out;
}

/** 「, 」「 」区切りの使いたい文字を1文字ずつの配列に正規化（T-102）。 */
export function normalizeIncludeChars(input: string[] | undefined): string[] {
  if (!input) return [];
  const out: string[] = [];
  for (const token of input) {
    for (const ch of Array.from((token ?? "").replace(/[,\s、]+/g, ""))) {
      out.push(ch);
    }
  }
  return Array.from(new Set(out));
}

async function strokeTotalOf(
  name: string,
  lookup?: LookupDeps
): Promise<number | null> {
  try {
    const strokes = await lookupStrokes(name, lookup);
    return strokes.reduce((a, b) => a + b, 0);
  } catch {
    return null; // 画数が引けない候補は除外
  }
}

function passesFilters(
  c: Pick<NameCandidate, "name" | "type" | "targets">,
  input: SuggestInput,
  includeChars: string[]
): boolean {
  if (!c.targets.includes(input.target)) return false;
  if (input.charTypes && input.charTypes.length > 0) {
    if (!input.charTypes.includes(c.type)) return false;
  }
  if (includeChars.length > 0) {
    const chars = new Set(Array.from(c.name));
    if (!includeChars.every((ch) => chars.has(ch))) return false;
  }
  return true;
}

function scoreCandidate(
  c: NameCandidate,
  strokeTotal: number,
  input: SuggestInput
): { score: number; reasons: string[] } {
  const w = SUGGEST_WEIGHTS;
  const reasons: string[] = [];
  let acc = 0;
  let wsum = 0;

  // 画数の吉凶（常に評価）
  const ev = evaluateStroke(strokeTotal, "unspecified");
  acc += ev.quality * w.stroke;
  wsum += w.stroke;
  if (ev.category === "daikichi" || ev.category === "kichi") {
    reasons.push(`画数${strokeTotal}が${ev.categoryLabel}`);
  }

  // 性別一致（重み大）
  if (input.sex) {
    const g =
      c.genders.includes(input.sex) ? 100 : c.genders.includes("neutral") ? 70 : 25;
    acc += g * w.gender;
    wsum += w.gender;
    if (c.genders.includes(input.sex)) reasons.push(`${input.sex === "male" ? "男の子" : "女の子"}向き`);
  }

  // カテゴリ一致
  if (input.categories && input.categories.length > 0) {
    const hit = input.categories.filter((cat) => c.categories.includes(cat));
    const cs = hit.length > 0 ? 100 : 40;
    acc += cs * w.category;
    wsum += w.category;
    if (hit.length > 0) reasons.push(`${hit.join("・")}`);
  }

  return { score: Math.round(acc / wsum), reasons };
}

async function toItem(
  c: NameCandidate,
  input: SuggestInput,
  source: "master" | "dynamic"
): Promise<SuggestItem | null> {
  const total = await strokeTotalOf(c.name, input.lookup);
  if (total == null) return null;
  const ev = evaluateStroke(total, "unspecified");
  const { score, reasons } = scoreCandidate(c, total, input);
  return {
    name: c.name,
    reading: c.reading,
    type: c.type,
    strokeTotal: total,
    fortune: ev.category,
    fortuneLabel: ev.categoryLabel,
    score,
    source,
    reasons,
  };
}

/** 希望よみから動的にかな候補を生成する（マスタ不足時の補完）。 */
function dynamicFromReading(input: SuggestInput): NameCandidate[] {
  const reading = (input.reading ?? "").trim();
  if (!reading) return [];
  const out: NameCandidate[] = [];
  const hira: NameCandidate = {
    name: reading,
    reading,
    type: "hiragana",
    targets: [input.target],
    genders: ["neutral"],
    categories: [],
  };
  const kata: NameCandidate = {
    name: toKatakana(reading),
    reading,
    type: "katakana",
    targets: [input.target],
    genders: ["neutral"],
    categories: [],
  };
  out.push(hira, kata);
  return out;
}

/**
 * 条件に合うペット名候補をスコア順に返す。
 * @throws SuggestInvalidError 出力文字種と使いたい文字が矛盾する等
 */
export async function suggest(input: SuggestInput): Promise<SuggestItem[]> {
  const includeChars = normalizeIncludeChars(input.includeChars);
  const limit = input.limit ?? 20;

  // 矛盾チェック（T-104）: 使いたい文字がすべて漢字なのに出力文字種が「かなのみ」等
  if (
    includeChars.length > 0 &&
    input.charTypes &&
    input.charTypes.length > 0 &&
    !input.charTypes.includes("kanji")
  ) {
    const hasKanji = includeChars.some((ch) => /[一-鿿々]/.test(ch));
    if (hasKanji) {
      throw new SuggestInvalidError(
        "使いたい文字に漢字が含まれていますが、出力文字種が漢字を許可していません。条件を見直してください。"
      );
    }
  }

  // 1) マスタからフィルタ＋スコア
  const master = allCandidates().filter((c) =>
    passesFilters(c, input, includeChars)
  );
  const items: SuggestItem[] = [];
  for (const c of master) {
    const it = await toItem(c, input, "master");
    if (it) items.push(it);
  }

  // 2) 不足時は希望よみから動的補完（マスタ→動的）
  const MIN = 8;
  if (items.length < MIN) {
    const dyn = dynamicFromReading(input).filter((c) =>
      passesFilters(c, input, includeChars)
    );
    const existing = new Set(items.map((i) => i.name));
    for (const c of dyn) {
      if (existing.has(c.name)) continue;
      const it = await toItem(c, input, "dynamic");
      if (it) items.push(it);
    }
  }

  // スコア降順（同点は画数吉凶→名前で安定化）
  items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return items.slice(0, limit);
}
