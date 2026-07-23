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
import { generateNamesByChar } from "./charNameLLM";
import { romajiOf, romajiName } from "./romaji";
import type { LlmProvider } from "../llm";

export interface SuggestInput {
  target: PetTarget;
  sex?: PetGender; // male / female（未指定可）
  categories?: string[]; // 希望カテゴリ（OR一致でスコア加点）
  includeChars?: string[]; // 使いたい文字（v2.4.0: 単体1文字。複数来ても先頭のみ採用）
  charTypes?: NameType[]; // 出力文字種の許可リスト（未指定なら全許可。romaji含む）
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

/**
 * フォールバックのお知らせ（F-003・v2.4.0）。
 * 使いたい文字と希望のよみを両立できず、よみを優先したときに返す。
 * 文言はフロントで組み立てる（サーバーは構造化情報のみ返す）。
 */
export interface SuggestNotice {
  kind: "reading_over_char";
  /** 両立できず落とした使いたい文字。 */
  droppedChar: string;
  /** 優先した希望のよみ。 */
  reading: string;
}

/** suggest の結果。候補と、必要ならお知らせを返す。 */
export interface SuggestResult {
  candidates: SuggestItem[];
  notice?: SuggestNotice;
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

/**
 * 使いたい文字を**単体1文字**に正規化する（F-003・v2.4.0）。
 * 【仕様】使いたい文字は1文字。複数入っていても**先頭1文字のみ**採用する
 * （UIでも1文字に制限するが、サーバー側の保険として先頭を取る）。
 * 区切り記号・空白は除去し、最初の1文字を返す。空なら null。
 */
export function normalizeIncludeChar(input: string[] | undefined): string | null {
  if (!input) return null;
  for (const token of input) {
    const cleaned = Array.from((token ?? "").replace(/[,\s、]+/g, ""));
    if (cleaned.length > 0) return cleaned[0];
  }
  return null;
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

/** 使いたい文字の種別。 */
export type WantedCharKind = "kana" | "kanji" | "alphabet" | "other";

export function wantedCharKind(ch: string): WantedCharKind {
  if (/[A-Za-z]/.test(ch)) return "alphabet";
  if (/[ぁ-んァ-ヶーゝゞ]/.test(ch)) return "kana";
  if (/[一-鿿々]/.test(ch)) return "kanji";
  return "other";
}

/**
 * 「使いたい文字」（単体1文字）を、名前の**表記**に含むか判定する（F-003・v2.4.0）。
 *
 * 【仕様】文字種を問わず「表記（見た目の字）」に含まれるかで判定する。
 *   - 漢字・かな: 候補の name（表記）にその字が含まれるか。かな照合は
 *     ひらがな/カタカナを同一視する（「も」指定で「モモ」も一致）。
 *   - アルファベット: **ローマ字表記**（よみをヘボン式変換）に、その字が
 *     含まれるか（大文字小文字は同一視）。日本語ローマ字に無い字（l 等）は
 *     一致しないが、それは正しい挙動（無理に作らない）。
 */
export function containsWantedChar(
  c: Pick<NameCandidate, "name" | "reading">,
  ch: string
): boolean {
  const kind = wantedCharKind(ch);
  if (kind === "alphabet") {
    return romajiOf(c.reading ?? "").toLowerCase().includes(ch.toLowerCase());
  }
  if (kind === "kana") {
    // 表記をひらがなに揃えて照合（ひらがな・カタカナを同一視）
    const nameHira = toHiragana(c.name);
    return Array.from(nameHira).includes(toHiragana(ch));
  }
  // 漢字・その他は表記そのもので照合
  return Array.from(c.name).includes(ch);
}

function passesFilters(
  c: Pick<NameCandidate, "name" | "reading" | "type" | "targets">,
  input: SuggestInput,
  wantedChar: string | null
): boolean {
  if (!c.targets.includes(input.target)) return false;
  if (input.charTypes && input.charTypes.length > 0) {
    if (!input.charTypes.includes(c.type)) return false;
  }
  if (wantedChar && !containsWantedChar(c, wantedChar)) {
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
  // ローマ字表記はアルファベットに画数が無いため、よみ（かな）で画数を数える。
  const strokeSource = c.type === "romaji" ? c.reading : c.name;
  const total = await strokeTotalOf(strokeSource, input.lookup);
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

/** 出力を許可する文字種（未指定なら全許可）。 */
function allowedTypes(input: SuggestInput): NameType[] {
  return input.charTypes && input.charTypes.length > 0
    ? input.charTypes
    : ["hiragana", "katakana", "kanji", "romaji"];
}

/**
 * よみ（＋漢字表記があれば）から、出力する表記のバリエーションを作る。
 * 使いたい文字がある場合は、その字が「見える」表記型だけに絞る
 * （漢字→漢字表記／かな→ひらがな・カタカナ／アルファベット→ローマ字）。
 */
function buildVariants(
  reading: string,
  kanji: string | undefined,
  input: SuggestInput,
  wantedChar: string | null
): NameCandidate[] {
  const allowed = allowedTypes(input);
  const kind = wantedChar ? wantedCharKind(wantedChar) : null;
  const relevant: NameType[] =
    kind === "kanji"
      ? ["kanji"]
      : kind === "kana"
      ? ["hiragana", "katakana"]
      : kind === "alphabet"
      ? ["romaji"]
      : ["hiragana", "katakana", "kanji", "romaji"];
  const types = allowed.filter((t) => relevant.includes(t));

  const hira = toHiragana(reading);
  const base = {
    reading,
    targets: [input.target],
    genders: ["neutral"] as PetGender[],
    categories: [] as string[],
  };
  const out: NameCandidate[] = [];
  for (const t of types) {
    if (t === "hiragana") out.push({ ...base, name: hira, type: "hiragana" });
    else if (t === "katakana")
      out.push({ ...base, name: toKatakana(hira), type: "katakana" });
    else if (t === "kanji" && kanji)
      out.push({ ...base, name: kanji, type: "kanji" });
    else if (t === "romaji")
      out.push({ ...base, name: romajiName(reading), type: "romaji" });
  }
  return out;
}

/** 使いたい文字と出力文字種の矛盾チェック（T-104・T-334）。 */
function checkCharTypeConflict(ch: string, charTypes?: NameType[]): void {
  if (!charTypes || charTypes.length === 0) return; // 全許可なら矛盾なし
  const kind = wantedCharKind(ch);
  if (kind === "kanji" && !charTypes.includes("kanji")) {
    throw new SuggestInvalidError(
      "使いたい文字が漢字ですが、出力文字種が漢字を許可していません。条件を見直してください。"
    );
  }
  if (kind === "alphabet" && !charTypes.includes("romaji")) {
    throw new SuggestInvalidError(
      "使いたい文字がアルファベットですが、出力文字種に「ローマ字」が含まれていません。ローマ字を選ぶか、文字を変えてください。"
    );
  }
  if (
    kind === "kana" &&
    !charTypes.includes("hiragana") &&
    !charTypes.includes("katakana")
  ) {
    throw new SuggestInvalidError(
      "使いたい文字がかなですが、出力文字種がひらがな・カタカナを許可していません。条件を見直してください。"
    );
  }
}

/** 希望のよみ由来の候補（かな・ローマ字＋LLM漢字）。最大6件。 */
async function collectReadingItems(
  input: SuggestInput,
  reading: string,
  wantedChar: string | null,
  seen: Set<string>
): Promise<SuggestItem[]> {
  const items: SuggestItem[] = [];

  // かな・ローマ字候補
  for (const cand of buildVariants(reading, undefined, input, wantedChar)) {
    if (seen.has(cand.name)) continue;
    if (!passesFilters(cand, input, wantedChar)) continue;
    const it = await toItem(cand, input, "dynamic");
    if (it) {
      it.reasons.unshift("ご希望のよみ");
      items.push(it);
      seen.add(cand.name);
    }
  }

  // 漢字表記（F-004・LLM生成。漢字が許可されている場合）
  if (allowedTypes(input).includes("kanji")) {
    const names = await generateKanjiNames(reading, input.target, input.llmProviders);
    const kanjiItems: SuggestItem[] = [];
    for (const name of names) {
      if (seen.has(name)) continue;
      const cand: NameCandidate = {
        name,
        reading,
        type: "kanji",
        targets: [input.target],
        genders: ["neutral"],
        categories: [],
      };
      if (!passesFilters(cand, input, wantedChar)) continue;
      const it = await toItem(cand, input, "dynamic");
      if (it) {
        it.reasons.unshift("ご希望のよみ（漢字）");
        kanjiItems.push(it);
        seen.add(name);
      }
    }
    // LLM の先頭2つ（自然さ優先）＋残りは画数スコア上位
    const firstTwo = kanjiItems.slice(0, 2);
    const rest = kanjiItems
      .slice(2)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    items.push(...firstTwo, ...rest);
  }

  return items.slice(0, 6);
}

/** 使いたい文字由来の候補（LLM生成→表記照合で検証）。 */
async function collectCharItems(
  input: SuggestInput,
  wantedChar: string,
  reading: string | null,
  seen: Set<string>,
  limit: number
): Promise<SuggestItem[]> {
  const gens = await generateNamesByChar({
    char: wantedChar,
    charKind: wantedCharKind(wantedChar),
    target: input.target,
    sex: input.sex,
    categories: input.categories,
    reading: reading ?? undefined,
    providers: input.llmProviders,
  });

  const items: SuggestItem[] = [];
  for (const g of gens) {
    if (items.length >= limit) break;
    for (const cand of buildVariants(g.reading, g.kanji, input, wantedChar)) {
      if (items.length >= limit) break;
      if (seen.has(cand.name)) continue;
      if (!passesFilters(cand, input, wantedChar)) continue;
      const it = await toItem(cand, input, "chars");
      if (it) {
        it.reasons.unshift(`「${wantedChar}」を含む`);
        items.push(it);
        seen.add(cand.name);
      }
    }
  }
  return items;
}

/** 不足分をマスタからランダムに埋める（従前の仕組みを踏襲）。 */
async function fillFromMaster(
  input: SuggestInput,
  need: number,
  wantedChar: string | null,
  seen: Set<string>
): Promise<SuggestItem[]> {
  if (need <= 0) return [];
  const master = await getCandidates();
  const kind = wantedChar ? wantedCharKind(wantedChar) : null;

  // アルファベットの使いたい文字は、マスタ候補をローマ字表記に直してから照合する
  // （マスタにローマ字名は無いため、よみから変換して「見える表記」に合わせる）。
  const remap = (c: NameCandidate): NameCandidate =>
    kind === "alphabet"
      ? { ...c, name: romajiName(c.reading), type: "romaji" }
      : c;

  const pool = master
    .map(remap)
    .filter((c) => passesFilters(c, input, wantedChar) && !seen.has(c.name));
  const preferred = pool.filter((c) => matchesPreferences(c, input));
  const rest = pool.filter((c) => !matchesPreferences(c, input));
  const ordered = [...shuffle(preferred), ...shuffle(rest)];

  const out: SuggestItem[] = [];
  for (const c of ordered) {
    if (out.length >= need) break;
    if (seen.has(c.name)) continue;
    const it = await toItem(c, input, "master");
    if (it) {
      out.push(it);
      seen.add(c.name);
    }
  }
  return out;
}

/**
 * 条件に合うペット名候補を返す（F-002〜F-005・F-003 v2.4.0）。
 *
 * ユーザー希望（希望のよみ・使いたい文字）由来をLLMで生成し、不足分を
 * 条件一致マスタからランダムに埋める。使いたい文字＋希望のよみを両立できない
 * ときは、よみを優先し `notice` を返す（2段構え）。
 *
 * @throws SuggestInvalidError 出力文字種と使いたい文字が矛盾する等
 */
export async function suggest(input: SuggestInput): Promise<SuggestResult> {
  const wantedChar = normalizeIncludeChar(input.includeChars);
  const count = input.count ?? input.limit ?? SUGGEST_DEFAULT_COUNT;
  const reading = (input.reading ?? "").trim();

  if (wantedChar) checkCharTypeConflict(wantedChar, input.charTypes);

  const seen = new Set<string>();
  const userItems: SuggestItem[] = [];
  let notice: SuggestNotice | undefined;
  // マスタ埋めで使いたい文字フィルタをかけるか（よみ優先に落ちたら外す）
  let fillWantedChar: string | null = wantedChar;

  if (wantedChar && reading) {
    // 両方指定 → 2段構え。まず両立を要求する。
    const both = await collectCharItems(input, wantedChar, reading, seen, 6);
    if (both.length > 0) {
      userItems.push(...both);
    } else {
      // 両立ゼロ → よみを優先（使いたい文字を捨てる）。お知らせを返す。
      notice = { kind: "reading_over_char", droppedChar: wantedChar, reading };
      fillWantedChar = null;
      userItems.push(...(await collectReadingItems(input, reading, null, seen)));
    }
  } else if (wantedChar) {
    userItems.push(...(await collectCharItems(input, wantedChar, null, seen, count)));
  } else if (reading) {
    userItems.push(...(await collectReadingItems(input, reading, null, seen)));
  }

  const fill = await fillFromMaster(
    input,
    count - userItems.length,
    fillWantedChar,
    seen
  );

  return { candidates: [...userItems, ...fill], notice };
}
