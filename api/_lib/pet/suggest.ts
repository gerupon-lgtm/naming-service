// ペット命名候補の提案（Phase2・F-002〜F-005）。
//
// 苗字がないため姓名判断は「地格＝総格（名前の合計画数）」のみで評価する。
// 合成スコア = 画数の吉凶 ＋ 性別一致（重み大）＋ カテゴリ一致。
// マスタ候補が少ない場合は、希望よみから動的にかな候補を補完する（マスタ→動的）。

import {
  getCandidates,
  type NameCandidate,
  type PetTarget,
  type PetGender,
  type NameType,
} from "./nameMaster";
import { lookupStrokes, type LookupDeps } from "../characterMaster";
import { evaluateStroke, CATEGORY_LABEL, type FortuneCategory } from "../fortune";
import { generateKanjiNames } from "./kanjiNameLLM";
import { generateNamesByChars } from "./charNameLLM";
import type { LlmProvider } from "../llm";

export interface SuggestInput {
  target: PetTarget;
  sex?: PetGender; // male / female（未指定可）
  categories?: string[]; // 希望カテゴリ（OR一致でスコア加点）
  includeChars?: string[]; // 使いたい文字（AND・すべて含む）
  charTypes?: NameType[]; // 出力文字種の許可リスト（未指定なら全許可）
  reading?: string; // 希望よみ（かな候補＋漢字はLLM生成）
  count?: number; // 表示したい候補数（既定 SUGGEST_DEFAULT_COUNT）
  limit?: number; // count の別名（後方互換）
  lookup?: LookupDeps; // 画数参照の依存差し替え（テスト用）
  llmProviders?: LlmProvider[]; // 漢字生成LLMの差し替え（テスト用）
}

export interface SuggestItem {
  name: string;
  reading: string;
  type: NameType;
  strokeTotal: number; // 地格＝総格
  fortune: FortuneCategory; // 画数の吉凶
  fortuneLabel: string; // 大吉 等
  score: number; // 合成スコア 0〜100
  /**
   * 候補の出どころ。画面のチップ表示に使うため、生成由来を区別する。
   *   master  = 命名候補マスタから
   *   dynamic = 希望よみから生成（かな・LLMによる漢字表記）
   *   chars   = 使いたい文字からLLM生成
   */
  source: "master" | "dynamic" | "chars";
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

/** カタカナ→ひらがな変換（よみの比較を揃えるため）。 */
function toHiragana(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    out +=
      code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch;
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

/** かな1文字か（ひらがな・カタカナ・長音）。 */
function isKanaChar(ch: string): boolean {
  return /[ぁ-んァ-ヶー]/.test(ch);
}

/**
 * 「使いたい文字」を含むか判定する。
 *
 * 【仕様・v2.3.0で変更】かなは**よみ**に対して、漢字は**表記**に対して判定する。
 * 以前は表記だけを見ていたため、「あ」「み」のようなかな指定では漢字候補が
 * 原理的に一件も一致しなかった。ユーザーの意図は「そう読める名前」なので、
 * かなはよみで見るのが正しい。
 */
function containsWantedChars(
  c: Pick<NameCandidate, "name" | "reading">,
  includeChars: string[]
): boolean {
  const readingChars = new Set(Array.from(toHiragana(c.reading ?? "")));
  const nameChars = new Set(Array.from(c.name));
  return includeChars.every((ch) =>
    isKanaChar(ch) ? readingChars.has(toHiragana(ch)) : nameChars.has(ch)
  );
}

function passesFilters(
  c: Pick<NameCandidate, "name" | "reading" | "type" | "targets">,
  input: SuggestInput,
  includeChars: string[]
): boolean {
  if (!c.targets.includes(input.target)) return false;
  if (input.charTypes && input.charTypes.length > 0) {
    if (!input.charTypes.includes(c.type)) return false;
  }
  if (includeChars.length > 0 && !containsWantedChars(c, includeChars)) {
    return false;
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
  source: "master" | "dynamic" | "chars"
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
    // LLM に「そのよみで自然な漢字表記」を生成させる（機械的逆引きの不自然さを回避）。
    const names = await generateKanjiNames(
      input.reading,
      input.target,
      input.llmProviders
    );
    const kanjiItems: SuggestItem[] = [];
    const seen = new Set(readingItems.map((i) => i.name));
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      const cand: NameCandidate = {
        name,
        reading: input.reading,
        type: "kanji",
        targets: [input.target],
        genders: ["neutral"],
        categories: [],
      };
      if (!passesFilters(cand, input, includeChars)) continue;
      const it = await toItem(cand, input, "dynamic"); // 画数が引けないものは null で除外
      if (it) {
        it.reasons.unshift("ご希望のよみ（漢字）");
        kanjiItems.push(it);
      }
    }
    // LLM の先頭2つ（自然さ優先）＋残りは画数スコア上位、で採用。
    const firstTwo = kanjiItems.slice(0, 2);
    const restByScore = kanjiItems
      .slice(2)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const chosen = [...firstTwo, ...restByScore];
    // よみ由来（かな＋漢字）は最大6件まで（不足分は後段でマスタからランダム）
    readingItems.push(...chosen.slice(0, Math.max(0, 6 - readingItems.length)));
  }

  // 1.5) 使いたい文字が指定されていれば、LLM に候補を生成させる（F-003・v2.3.0）。
  //
  // 【なぜLLMか】使いたい文字 × 雰囲気 × 性別 × 文字種 は組合せが爆発するため、
  // 有限のマスタでは賄えない（216件に「あ」と「み」のAND条件をかけると
  // ほぼゼロ件になる）。生成した候補は passesFilters と画数参照を必ず通す。
  // LLM 応答不可・条件を満たす出力が無い場合は、後段のマスタ補完だけで動く。
  if (includeChars.length > 0) {
    const generated = await generateNamesByChars({
      includeChars,
      target: input.target,
      sex: input.sex,
      categories: input.categories,
      charTypes: input.charTypes,
      providers: input.llmProviders,
    });

    for (const g of generated) {
      if (readingItems.length >= count) break;
      // 表記に漢字を含むかで文字種を判定し、かなだけなら ひらがな候補として扱う
      const hasKanji = /[一-鿿々]/.test(g.name);
      const cand: NameCandidate = {
        name: g.name,
        reading: g.reading,
        type: hasKanji ? "kanji" : "hiragana",
        targets: [input.target],
        genders: ["neutral"],
        categories: [],
      };
      if (!passesFilters(cand, input, includeChars)) continue;
      // 由来を "chars" にして、画面で「よみから生成」と区別できるようにする
      const it = await toItem(cand, input, "chars"); // 画数が引けないものは除外
      if (it && !readingItems.some((r) => r.name === it.name)) {
        it.reasons.unshift(`「${includeChars.join("・")}」を含む`);
        readingItems.push(it);
      }
    }
  }

  // 2) 一定数（count）に満たない分を、選択条件に合うマスタから「ランダム」に埋める。
  //    ユーザー希望（よみ由来・使いたい文字由来）を先頭に固定し、残り枠を埋める。
  const readingNames = new Set(readingItems.map((i) => i.name));
  const need = count - readingItems.length;
  const fillItems: SuggestItem[] = [];

  if (need > 0) {
    // ハードフィルタ（対象動物・使いたい文字・出力文字種）を通ったマスタ（DB優先・seedフォールバック）
    const master = await getCandidates();
    const hardPool = master.filter(
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
