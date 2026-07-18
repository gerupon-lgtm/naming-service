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
import { wuxingOf } from "./fortune/sansai";
import { calcWuxingBalance, calcWuxingBonus } from "./bazi/wuxing";
import type { WuxingBonus } from "./bazi/types";

export interface DiagnoseInput {
  sei: string;
  mei: string;
  /** 性別（未指定可）。五格計算には影響せず、吉凶の解釈にのみ反映。 */
  sex?: Sex;
  methodId?: string;
  /** 文字参照の依存差し替え（テスト・純ローカル計算用）。 */
  lookup?: LookupDeps;

  // --- 四柱推命による五行ボーナス（F-015）。すべて任意 -----------------
  //
  // 【厳守】これらは wuxingBonus の算出にのみ使い、score / rank / 五格 には
  // 一切影響させないこと。共有URL（F-006）は sei/mei/sex のみで再現する設計で、
  // 生年月日はプライバシー上URLに載せないため、影響させると本人が見た結果と
  // 共有URLで開いた結果が食い違う。
  //
  // 生年月日のみで判定できる（L1）。出生時刻・出生地は任意で、未入力でも
  // 処理を止めない。未入力項目を勝手に補完しないこと。

  /** "YYYY-MM-DD"。指定時のみ wuxingBonus を返す。 */
  birthDate?: string;
  /** "HH:mm"（任意）。 */
  birthTime?: string;
  /** 都道府県コードまたは名称（任意）。 */
  birthPlace?: string;
  timezone?: string;
}

/** "YYYY-MM-DD" 形式かつ実在する日付か。 */
function isValidBirthDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** "HH:mm" 形式かつ実在する時刻か。 */
function isValidBirthTime(v: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const [h, mi] = v.split(":").map(Number);
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
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

  // 四柱推命による五行ボーナス（F-015）。
  // 生年月日の入力があるときだけ算出する。ここより上で確定した
  // score / rank / gokaku は一切書き換えないこと。
  let wuxingBonus: WuxingBonus | undefined;
  const birthDate = normalize(input.birthDate ?? "");
  if (birthDate && isValidBirthDate(birthDate)) {
    const birthTime = normalize(input.birthTime ?? "");
    try {
      const balance = calcWuxingBalance({
        birthDate,
        // 不正な時刻は「無かったもの」として扱い、処理を止めない（L1に縮退）
        birthTime: birthTime && isValidBirthTime(birthTime) ? birthTime : undefined,
        birthPlace: normalize(input.birthPlace ?? "") || undefined,
        timezone: input.timezone,
      });
      wuxingBonus = calcWuxingBonus(balance, wuxingOf(gokaku.soukaku), [
        sansai.ten,
        sansai.jin,
        sansai.chi,
      ]);
    } catch {
      // ボーナスは参考情報。算出に失敗しても診断結果本体は返す
      wuxingBonus = undefined;
    }
  }

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
    ...(wuxingBonus ? { wuxingBonus } : {}),
  };
}

/** [start, end) の整数配列。 */
function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}
