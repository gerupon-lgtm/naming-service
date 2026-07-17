// 姓名診断のオーケストレーション（F-001）。
// 入力の正規化 → 画数参照 → 五格計算 → スコア・ランク算出。

import {
  getMethod,
  DiagnosisResult,
  KakuDetail,
  evaluateStroke,
  calcSansai,
  KAKU_INFO,
  KAKU_ORDER,
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

  // 各格の詳細（役割・吉凶・意味）を性別込みで組み立てる
  const details: KakuDetail[] = KAKU_ORDER.map((key) => {
    const strokes = gokaku[key as keyof Gokaku];
    const ev = evaluateStroke(strokes, sex);
    const info = KAKU_INFO[key];
    return {
      key,
      label: info.label,
      strokes,
      category: ev.category,
      categoryLabel: ev.categoryLabel,
      role: info.role,
      keyword: ev.keyword,
      summary: ev.summary,
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
    details,
    sansai,
    wuxing,
  };
}
