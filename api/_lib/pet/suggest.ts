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
import {
  lookupStrokes,
  strokeCountOf,
  type LookupDeps,
} from "../characterMaster";
import { evaluateStroke, CATEGORY_LABEL, type FortuneCategory } from "../fortune";
import { readingKanjiCandidates } from "./readingLookup";
import type { KanjiApiReadingDeps } from "../kanjiapiReading";
import nameKanjiAllow from "../../../db/seed/name_kanji_allow.json";

// 名前向きの常用漢字（新聞頻度＋教育漢字）。逆引き漢字はこの集合に限定して稀字を排除。
const NAME_KANJI_ALLOW = new Set<string>(nameKanjiAllow as string[]);

export interface SuggestInput {
  target: PetTarget;
  sex?: PetGender; // male / female（未指定可）
  categories?: string[]; // 希望カテゴリ（OR一致でスコア加点）
  includeChars?: string[]; // 使いたい文字（AND・すべて含む）
  charTypes?: NameType[]; // 出力文字種の許可リスト（未指定なら全許可）
  reading?: string; // 希望よみ（かな候補＋漢字逆引きに使用）
  count?: number; // 表示したい候補数（既定 SUGGEST_DEFAULT_COUNT）
  limit?: number; // count の別名（後方互換）
  lookup?: LookupDeps; // 画数参照の依存差し替え（テスト用）
  readingApi?: KanjiApiReadingDeps; // 読み逆引き（kanjiapi.dev）の差し替え（テスト用）
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

/**
 * 表示したい候補数の既定値（設定値）。
 * ユーザー希望（よみ由来）を優先し、これに満たない分を条件に合うマスタから
 * ランダムに選定して埋める。件数を変えたいときはこの値を変更する。
 */
export const SUGGEST_DEFAULT_COUNT = 8;

/** 配列をシャッフル（Fisher–Yates）。 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 選択条件（性別・カテゴリ）に沿うか（未指定の条件は常に一致扱い）。 */
export function matchesPreferences(c: NameCandidate, input: SuggestInput): boolean {
  if (input.sex) {
    if (!c.genders.includes(input.sex) && !c.genders.includes("neutral")) {
      return false;
    }
  }
  if (input.categories && input.categories.length > 0) {
    if (!input.categories.some((cat) => c.categories.includes(cat))) {
      return false;
    }
  }
  return true;
}

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
  const count = input.count ?? input.limit ?? SUGGEST_DEFAULT_COUNT;

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

  // 1) 希望のよみがあれば、その名前を必ず候補に含める（先頭・ご希望のよみ）
  const readingItems: SuggestItem[] = [];
  const readingCands = dynamicFromReading(input).filter((c) =>
    passesFilters(c, input, includeChars)
  );
  for (const c of readingCands) {
    const it = await toItem(c, input, "dynamic");
    if (it) {
      it.reasons.unshift("ご希望のよみ");
      readingItems.push(it);
    }
  }

  // 1b) 希望のよみを漢字に逆引きして合成（F-004・漢字が許可されている場合）
  const kanjiAllowed =
    !input.charTypes ||
    input.charTypes.length === 0 ||
    input.charTypes.includes("kanji");
  if (input.reading && kanjiAllowed) {
    const kanjiCands = await readingKanjiCandidates(input.reading, input.readingApi);
    const kanjiItems: SuggestItem[] = [];
    for (const kc of kanjiCands) {
      // 名前向きの常用漢字だけで構成される名前のみ採用（稀字・見慣れない字を排除）。
      // かつ画数が引ける（シード収録）こと。
      const chars = Array.from(kc.name);
      if (!chars.every((ch) => NAME_KANJI_ALLOW.has(ch) && strokeCountOf(ch) !== undefined)) {
        continue;
      }
      const cand: NameCandidate = {
        name: kc.name,
        reading: kc.reading,
        type: "kanji",
        targets: [input.target],
        genders: ["neutral"],
        categories: [],
      };
      if (!passesFilters(cand, input, includeChars)) continue;
      const it = await toItem(cand, input, "dynamic");
      if (it) {
        it.reasons.unshift("ご希望のよみ（漢字）");
        kanjiItems.push(it);
      }
    }
    // 画数の良い順。よみ由来（かな＋漢字）は最大6件まで（努力目標3件以上、全体は最大8件）
    kanjiItems.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    readingItems.push(...kanjiItems.slice(0, Math.max(0, 6 - readingItems.length)));
  }

  // 2) 一定数（count）に満たない分を、選択条件に合うマスタから「ランダム」に埋める。
  //    ユーザー希望（よみ由来）を先頭に固定し、残り枠を埋める。
  const readingNames = new Set(readingItems.map((i) => i.name));
  const need = count - readingItems.length;
  const fillItems: SuggestItem[] = [];

  if (need > 0) {
    // ハードフィルタ（対象動物・使いたい文字・出力文字種）を通ったマスタ
    const hardPool = allCandidates().filter(
      (c) => passesFilters(c, input, includeChars) && !readingNames.has(c.name)
    );
    // まずは選択条件（性別・カテゴリ）にも沿うものを優先プールに
    const preferred = hardPool.filter((c) => matchesPreferences(c, input));
    const rest = hardPool.filter((c) => !matchesPreferences(c, input));

    // 優先プールからランダム → 足りなければ残りからランダムで補う。
    // 画数が引けず落ちる候補があっても件数を満たすよう、必要数に達するまで進める。
    const ordered = [...shuffle(preferred), ...shuffle(rest)];
    for (const c of ordered) {
      if (fillItems.length >= need) break;
      const it = await toItem(c, input, "master");
      if (it) fillItems.push(it);
    }
  }

  return [...readingItems, ...fillItems];
}
