// 用神の決定と「五行ボーナス」の判定。docs/integration-shichu.md 3.3 / 4.3 / 11.3.1。
//
// 【最重要の制約】
// この判定は姓名判断の総合スコア・ランク・五格を一切変えない。
// 「四柱推命による五行ボーナス」として別枠で表示する参考情報である。
//   理由: 共有URL（F-006）は sei/mei/sex のみで再現する設計で、生年月日は
//   プライバシー上URLに載せない。スコアに影響すると本人が見た結果と
//   共有URLで開いた結果が食い違い、「同じ名前・同じ性別なら同じ結果」という
//   姓名判断の一貫性も崩れるため。
//
// 【用神論】補うべき五行は「最も少ない五行」ではなく用神で決める。
//   身弱 → 印星（日干を生む）・比劫（日干と同じ）
//   身強 → 食傷（日干が生む）・財（日干が剋す）・官（日干を剋す）

import type {
  BaziInput,
  BonusLevel,
  InputLevel,
  Meishiki,
  WuxingBalance,
  WuxingBonus,
  Wuxing,
} from "./types";
import { INPUT_LEVEL_LABEL } from "./types";
import { WUXING_LABEL } from "../fortune/sansai";
import { buildMeishiki } from "./meishiki";
import {
  judgeStrength,
  elementThatGenerates,
  elementGeneratedBy,
  elementControlledBy,
  elementThatControls,
} from "./strength";

// ============================================================
//  設定値（判定ルール・表示文言。数値の重み係数は持たない）
// ============================================================

/** ⑦ 用神に加えて「日干を生む五行（印星）」を必ず候補に含めるか。 */
export const WUXING_INCLUDE_SUPPORT = true;

/**
 * 度合いのラベル。**画面には表示しない。**
 * 星と本文で伝える方針のため、視覚表示からは外している。
 * スクリーンリーダー向けの aria-label など、★の並びのテキスト等価物としてのみ使う。
 * 否定的な断定（「補えていません」等）は使わない。
 */
export const WUXING_BONUS_LABELS: Record<BonusLevel, string> = {
  3: "吉となる五行をしっかり備えています",
  2: "吉となる五行を備えています",
  1: "吉となる五行を部分的に備えています",
  0: "名前には吉となる五行は含まれていません",
};

export const WUXING_BONUS_STARS: Record<BonusLevel, string> = {
  3: "★★★",
  2: "★★☆",
  1: "★☆☆",
  0: "☆☆☆",
};

// ============================================================
//  用神の決定
// ============================================================

/**
 * 用神・喜神の優先リストを求める。
 *
 * 身弱: 印星（日干を生む）→ 比劫（日干と同じ）
 * 身強: 食傷（日干が生む）→ 財（日干が剋す）→ 官（日干を剋す）
 * 中和: 中庸なので、命式内で最も少ない五行を穏やかに補う方向とする
 */
export function decideTargetElements(
  meishiki: Meishiki,
  strength: "strong" | "neutral" | "weak"
): Wuxing[] {
  const day = meishiki.dayElement;
  const list: Wuxing[] = [];

  if (strength === "weak") {
    // 支える方向
    list.push(elementThatGenerates(day)); // 印星
    list.push(day);                        // 比劫
  } else if (strength === "strong") {
    // 漏らす・抑える方向
    list.push(elementGeneratedBy(day));    // 食傷
    list.push(elementControlledBy(day));   // 財
    list.push(elementThatControls(day));   // 官
  } else {
    // 中和: 最も少ない五行を補う（穏やかな調整）
    list.push(leastElement(meishiki.gogyoCount, day));
    if (WUXING_INCLUDE_SUPPORT) list.push(elementThatGenerates(day));
  }

  // 重複除去（順序は維持）
  return Array.from(new Set(list));
}

/** 最もカウントの少ない五行。同数なら日干以外を優先する。 */
function leastElement(
  counts: Record<Wuxing, number>,
  dayElement: Wuxing
): Wuxing {
  const order: Wuxing[] = ["wood", "fire", "earth", "metal", "water"];
  let best = order[0];
  for (const e of order) {
    if (counts[e] < counts[best]) best = e;
    else if (counts[e] === counts[best] && best === dayElement && e !== dayElement) {
      best = e;
    }
  }
  if (best === dayElement) return elementThatGenerates(dayElement);
  return best;
}

/**
 * 五行バランスと用神を求める。
 * Phase A（内蔵計算）／Phase B（四柱推命エンジン）で不変にする契約。
 * Phase B ではこの関数の中身のみ差し替える。
 */
export function calcWuxingBalance(input: BaziInput): WuxingBalance {
  const meishiki = buildMeishiki(input);
  const { strength } = judgeStrength(meishiki);

  return {
    counts: meishiki.gogyoCount,
    dayElement: meishiki.dayElement,
    weakElement: leastElement(meishiki.gogyoCount, meishiki.dayElement),
    supportElement: elementThatGenerates(meishiki.dayElement),
    strength,
    targetElements: decideTargetElements(meishiki, strength),
    level: meishiki.level,
  };
}

// ============================================================
//  五行ボーナスの判定
// ============================================================

/**
 * 判定ルール（設定値として差し替え可能にするため関数化）。
 *
 * **総格が主・三才が従**という役割分担に沿って4段階に切る。
 *  ★★★ 総格の五行が targetElements[0]（第1用神）に一致
 *  ★★☆ 総格の五行が targetElements[1] 以降（第2以降の用神）に一致
 *  ★☆☆ 総格は不一致だが、三才のいずれかが用神に一致（部分的な恩恵）
 *  ☆☆☆ どれにも一致しない（恩恵なし）
 */
export function judgeBonusLevel(
  targetElements: Wuxing[],
  soukakuElement: Wuxing,
  sansaiElements: Wuxing[]
): BonusLevel {
  if (targetElements.length === 0) return 0;
  const primary = targetElements[0];
  const secondary = targetElements.slice(1);

  if (soukakuElement === primary) return 3;
  if (secondary.includes(soukakuElement)) return 2;
  if (targetElements.some((e) => sansaiElements.includes(e))) return 1;
  return 0;
}

function levelHintOf(level: InputLevel): string | null {
  if (level === "L1") return "出生時刻の入力があると、より詳しく計算できます。";
  if (level === "L2") return "出生地の入力があると、さらに詳しく計算できます。";
  return null;
}

/**
 * 五行ボーナスを判定する。
 *
 * @param balance    calcWuxingBalance の結果
 * @param soukakuElement 総格の五行（fortune の wuxingOf(総格画数)）
 * @param sansaiElements 三才の五行（天・人・地）
 */
export function calcWuxingBonus(
  balance: WuxingBalance,
  soukakuElement: Wuxing,
  sansaiElements: Wuxing[]
): WuxingBonus {
  const level = judgeBonusLevel(
    balance.targetElements,
    soukakuElement,
    sansaiElements
  );

  const nameElements = [soukakuElement, ...sansaiElements];
  const matched = balance.targetElements.filter((e) => nameElements.includes(e));

  const primaryLabel = balance.targetElements.length
    ? WUXING_LABEL[balance.targetElements[0]]
    : "";
  const soukakuLabel = WUXING_LABEL[soukakuElement];

  // 文面の方針: 名前を否定しない。恩恵が無い場合も「補えていない」と断定せず、
  // 開運要素の案内に振る（ユーザーが入力した以上、必ず何かを返す）。
  const intro = `四柱推命では、あなたにとって吉となる五行は「${primaryLabel}」です。`;

  let summary: string;
  if (level === 3) {
    summary =
      intro +
      `この名前は総格が${soukakuLabel}にあたり、その要素をしっかり備えています。`;
  } else if (level === 2) {
    summary =
      intro +
      `この名前は総格が${soukakuLabel}にあたり、次に吉となる要素を備えています。`;
  } else if (level === 1) {
    // 【注意】ここで primaryLabel を使ってはいけない。
    // level 1 は「総格は不一致だが三才に用神が含まれる」状態であり、
    // 一致しているのは第2以降の用神であることが多い。第1用神を指して
    // 「その要素を含む」と書くと、含まれていない五行を含むと言ってしまう。
    const inSansai = balance.targetElements.filter((e) =>
      sansaiElements.includes(e)
    );
    const matchedLabel = inSansai.map((e) => WUXING_LABEL[e]).join("・");
    summary =
      intro +
      `この名前は総格が${soukakuLabel}ですが、三才に「${matchedLabel}」を含んでおり、` +
      `吉となる要素を部分的に備えています。`;
  } else {
    summary =
      intro +
      `身につけるものや過ごす環境で「${primaryLabel}」を意識すると、` +
      `巡りが整うかもしれません。`;
  }

  return {
    targetElements: balance.targetElements,
    soukakuElement,
    sansaiElements,
    matched,
    level,
    stars: WUXING_BONUS_STARS[level],
    label: WUXING_BONUS_LABELS[level],
    summary,
    source: "shichu",
    inputLevel: balance.level,
    levelHint: levelHintOf(balance.level),
  };
}

/** 表示用: 入力レベルのラベル（「標準」「詳しい」「最も詳しい」）。 */
export function inputLevelLabel(level: InputLevel): string {
  return INPUT_LEVEL_LABEL[level];
}
