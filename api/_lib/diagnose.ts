// 姓名診断のオーケストレーション（F-001）。
// 入力の正規化 → 画数参照 → 五格計算 → スコア・ランク算出。

import {
  getMethod,
  DiagnosisResult,
  KakuDetail,
  NameChar,
  evaluateStroke,
  calcSansai,
  KAKU_INFO,
  KAKU_ORDER,
  type KakuKey,
  type Gokaku,
  type Sex,
} from "./fortune";
import { scoreToRank } from "./fortune/score";
import {
  lookupStrokes,
  UnknownCharacterError,
  type LookupDeps,
} from "./characterMaster";

export interface DiagnoseInput {
  sei: string;
  mei: string;
  /** 性別（未指定可）。五格計算には影響せず、吉凶の解釈にのみ反映。 */
  sex?: Sex;
  methodId?: string;
  /** 文字参照の依存差し替え（テスト・純ローカル計算用）。 */
  lookup?: LookupDeps;
}

/** 入力バリデーション用エラー。 */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

/** 診断不可（未知文字）を表すエラー。 */
export class DiagnosisUnavailableError extends Error {
  constructor(public readonly characters: string[]) {
    super("DIAGNOSIS_UNAVAILABLE");
    this.name = "DiagnosisUnavailableError";
  }
}

function normalize(s: string): string {
  return (s ?? "").trim();
}

/**
 * 姓名を診断し、五格・スコア・ランクを返す。DB には保存しない。
 * @throws InvalidInputError 姓または名が空
 * @throws DiagnosisUnavailableError seed/kanjiapi いずれにも無い文字を含む
 */
export async function diagnose(input: DiagnoseInput): Promise<DiagnosisResult> {
  const sei = normalize(input.sei);
  const mei = normalize(input.mei);
  if (!sei) throw new InvalidInputError("姓を入力してください");
  if (!mei) throw new InvalidInputError("名を入力してください");

  let seiStrokes: number[];
  let meiStrokes: number[];
  try {
    [seiStrokes, meiStrokes] = await Promise.all([
      lookupStrokes(sei, input.lookup),
      lookupStrokes(mei, input.lookup),
    ]);
  } catch (e) {
    if (e instanceof UnknownCharacterError) {
      throw new DiagnosisUnavailableError(e.characters);
    }
    throw e;
  }

  const sex: Sex = input.sex ?? "unspecified";
  const method = getMethod(input.methodId);
  const gokaku = method.calcGokaku({ sei: seiStrokes, mei: meiStrokes });
  const score = method.calcScore(gokaku, sex);
  const rank = scoreToRank(score);

  // 名前を構成する文字（姓→名の順）
  const seiChars = Array.from(sei);
  const meiChars = Array.from(mei);
  const chars: NameChar[] = [
    ...seiChars.map((char, i) => ({ char, strokes: seiStrokes[i], part: "sei" as const })),
    ...meiChars.map((char, i) => ({ char, strokes: meiStrokes[i], part: "mei" as const })),
  ];
  const seiLen = seiChars.length;
  const total = chars.length;

  // 各格を構成する文字のインデックス（成り立ち表示用）
  const membersFor = (key: KakuKey): number[] => {
    switch (key) {
      case "tenkaku":
        return range(0, seiLen); // 姓すべて
      case "chikaku":
        return range(seiLen, total); // 名すべて
      case "jinkaku":
        return [seiLen - 1, seiLen]; // 姓の末字＋名の頭字
      case "gaikaku":
        return Array.from(new Set([0, total - 1])); // 外側の文字
      case "soukaku":
        return range(0, total); // 全文字
    }
  };
  const reisuFor = (key: KakuKey): boolean => {
    const meiLen = total - seiLen;
    if (key === "tenkaku") return seiLen === 1;
    if (key === "chikaku") return meiLen === 1;
    if (key === "gaikaku") return seiLen === 1 || meiLen === 1;
    return false;
  };

  // 各格の詳細（役割・吉凶・意味・成り立ち）を性別込みで組み立てる
  const details: KakuDetail[] = KAKU_ORDER.map((key) => {
    const strokes = gokaku[key as keyof Gokaku];
    const ev = evaluateStroke(strokes, sex);
    const info = KAKU_INFO[key];
    return {
      key,
      label: info.label,
      nickname: info.nickname,
      strokes,
      category: ev.category,
      categoryLabel: ev.categoryLabel,
      role: info.role,
      plain: info.plain,
      keyword: ev.keyword,
      summary: ev.summary,
      members: membersFor(key),
      ...(reisuFor(key) ? { reisu: true } : {}),
      ...(ev.caution ? { caution: ev.caution } : {}),
    };
  });

  // 三才配置（五行）＋五行サマリ
  const { sansai, wuxing } = calcSansai(
    gokaku.tenkaku,
    gokaku.jinkaku,
    gokaku.chikaku
  );

  return {
    ...gokaku,
    strokeTotal: gokaku.soukaku,
    score,
    rank,
    sex,
    chars,
    details,
    sansai,
    wuxing,
  };
}

/** [start, end) の整数配列。 */
function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}
