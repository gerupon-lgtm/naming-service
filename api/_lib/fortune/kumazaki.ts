// 熊崎式の五格計算＋スコア算出。
//
// 五格の定義（熊崎式）:
//   天格 = 姓の合計画数（姓が1文字なら霊数1を加える）
//   地格 = 名の合計画数（名が1文字なら霊数1を加える）
//   人格 = 姓の末字 ＋ 名の頭字
//   総格 = 姓名すべての合計画数（霊数は含めない）
//   外格 = 総格 − 人格 ＋ 霊数補正（姓が1文字なら+1、名が1文字なら+1）
//
// 霊数（れいすう）: 姓または名が1文字の場合、格が不当に小さくならないよう
// 仮想の1画を補う伝統的な補正。総格には加えない。

import { FortuneMethod, Gokaku, StrokeInput } from "./types";
import { qualityOf } from "./fortuneTable81";

/** 五格の重み（人格・総格を重視）。合計 1.0。調整可能な設定値。 */
export const GOKAKU_WEIGHTS = {
  jinkaku: 0.3,
  soukaku: 0.25,
  chikaku: 0.2,
  gaikaku: 0.15,
  tenkaku: 0.1,
} as const;

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export function calcGokaku(input: StrokeInput): Gokaku {
  const { sei, mei } = input;
  if (sei.length === 0 || mei.length === 0) {
    throw new Error("sei and mei must each contain at least one character");
  }

  const reiSei = sei.length === 1 ? 1 : 0; // 姓の霊数
  const reiMei = mei.length === 1 ? 1 : 0; // 名の霊数

  const tenkaku = sum(sei) + reiSei;
  const chikaku = sum(mei) + reiMei;
  const jinkaku = sei[sei.length - 1] + mei[0];
  const soukaku = sum(sei) + sum(mei); // 霊数は含めない
  const gaikaku = soukaku - jinkaku + reiSei + reiMei;

  return { tenkaku, jinkaku, chikaku, gaikaku, soukaku };
}

export function calcScore(g: Gokaku): number {
  const w = GOKAKU_WEIGHTS;
  const raw =
    qualityOf(g.jinkaku) * w.jinkaku +
    qualityOf(g.soukaku) * w.soukaku +
    qualityOf(g.chikaku) * w.chikaku +
    qualityOf(g.gaikaku) * w.gaikaku +
    qualityOf(g.tenkaku) * w.tenkaku;
  return Math.round(raw);
}

/** 熊崎式の流派実装。 */
export const kumazakiMethod: FortuneMethod = {
  id: "kumazaki",
  calcGokaku,
  calcScore,
};
