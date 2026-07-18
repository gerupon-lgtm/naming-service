// 日干の強弱（身強／中和／身弱）の判定。docs/integration-shichu.md 11.3.1。
//
// 【なぜ必要か】
// 補うべき五行は「最も少ない五行」ではなく「用神」で決める。用神は日干の強弱に
// よって向きが変わるため、まず身強／身弱を判定する必要がある。
//   身弱 → 日干を支える五行（印星・比劫）が用神
//   身強 → 日干を漏らす／抑える五行（食傷・財・官）が用神
//
// 【判定の構造（流派共通）】
//   1. 月令: 日干と月支の関係が判定の中心。日干が月支に通根しているか
//   2. 月支以外の地支（年・日・時）への通根を加点
//   3. 日干以外の天干（年・月・時）による支えを加点
//
// 点数の刻み方・閾値は流派差があるため設定値化する。

import type { Branch, Meishiki, Stem, Strength, StrengthResult, Wuxing } from "./types";
import { STEM_ELEMENT, ZOUKAN_TABLES, BAZI_ZOUKAN_TABLE } from "./meishiki";

// ============================================================
//  設定値（流派差があるため変更可能にする）
// ============================================================

export const STRENGTH_CONFIG = {
  /** 月支が日干と同じ五行（比和＝当旺）のときの点。判定の中心。 */
  monthSameElement: 6,
  /** 月支が日干を生む五行（次旺）のときの点。 */
  monthSupports: 4,
  /** 月支が日干に漏らされる／剋される関係のときの点（マイナス）。 */
  monthDrains: -3,
  /** 月支以外の地支が日干と同じ五行のときの点（1支あたり）。 */
  branchSameElement: 2,
  /** 月支以外の地支が日干を生む五行のときの点（1支あたり）。 */
  branchSupports: 1,
  /** 月支以外の地支が日干を弱める関係のときの点（1支あたり）。 */
  branchDrains: -1,
  /** 日干以外の天干が日干と同じ五行のときの点（1干あたり）。 */
  stemSameElement: 2,
  /** 日干以外の天干が日干を生む五行のときの点（1干あたり）。 */
  stemSupports: 1,
  /** 日干以外の天干が日干を弱める関係のときの点（1干あたり）。 */
  stemDrains: -1,
  /** 月支の蔵干が日干を支える（同じ／生む）ときの追加点。 */
  monthZoukanSupports: 2,

  /** 身強と判定する下限（この値以上）。 */
  strongThreshold: 6,
  /** 身弱と判定する上限（この値以下）。中和はこの間。 */
  weakThreshold: 1,
};

// ============================================================
//  五行の関係
// ============================================================

const CYCLE: Wuxing[] = ["wood", "fire", "earth", "metal", "water"];

/** a が b を生むか（相生）。 */
export function generates(a: Wuxing, b: Wuxing): boolean {
  return CYCLE[(CYCLE.indexOf(a) + 1) % 5] === b;
}

/** a が b を剋すか（相剋）。 */
export function controls(a: Wuxing, b: Wuxing): boolean {
  return CYCLE[(CYCLE.indexOf(a) + 2) % 5] === b;
}

/** 日干を生む五行（＝印星）。 */
export function elementThatGenerates(target: Wuxing): Wuxing {
  return CYCLE[(CYCLE.indexOf(target) + 4) % 5];
}

/** 日干が生む五行（＝食傷）。 */
export function elementGeneratedBy(target: Wuxing): Wuxing {
  return CYCLE[(CYCLE.indexOf(target) + 1) % 5];
}

/** 日干が剋す五行（＝財）。 */
export function elementControlledBy(target: Wuxing): Wuxing {
  return CYCLE[(CYCLE.indexOf(target) + 2) % 5];
}

/** 日干を剋す五行（＝官殺）。 */
export function elementThatControls(target: Wuxing): Wuxing {
  return CYCLE[(CYCLE.indexOf(target) + 3) % 5];
}

/**
 * 支え度: その五行が日干にとって
 *   +2 = 同じ（比劫） / +1 = 生む（印星） / -1 = 弱める（食傷・財・官）
 * を返す。
 */
function supportKind(element: Wuxing, dayElement: Wuxing): "same" | "supports" | "drains" {
  if (element === dayElement) return "same";
  if (generates(element, dayElement)) return "supports";
  return "drains";
}

// ============================================================
//  判定
// ============================================================

/** 地支の五行（蔵干の本気ベース）。通根の判定に使う。 */
function branchElementsOf(branch: Branch): Wuxing[] {
  const table = ZOUKAN_TABLES[BAZI_ZOUKAN_TABLE][branch];
  const set = new Set<Wuxing>();
  for (const [stem] of table) set.add(STEM_ELEMENT[stem as Stem]);
  return Array.from(set);
}

/**
 * 日干の強弱を判定する。
 * L1（三柱・時柱なし）でも月令中心のため機能する。時柱がないぶん精度は落ちるが
 * 判定自体は問題なく行える。
 */
export function judgeStrength(meishiki: Meishiki): StrengthResult {
  const c = STRENGTH_CONFIG;
  const dayElement = meishiki.dayElement;
  let score = 0;

  // --- 1. 月令（判定の中心）-----------------------------------------------
  const monthBranchElements = branchElementsOf(meishiki.month.branch);
  const rootedInMonth = monthBranchElements.includes(dayElement);

  const monthKind = supportKind(meishiki.month.branchElement, dayElement);
  if (monthKind === "same") score += c.monthSameElement;
  else if (monthKind === "supports") score += c.monthSupports;
  else score += c.monthDrains;

  // 月支の蔵干が日干を支えるなら加点（通根の強さを反映）
  if (meishiki.monthZoukan) {
    const zoukanElement = STEM_ELEMENT[meishiki.monthZoukan];
    const zk = supportKind(zoukanElement, dayElement);
    if (zk === "same" || zk === "supports") score += c.monthZoukanSupports;
  }

  // --- 2. 月支以外の地支への通根 -------------------------------------------
  // 月柱は 1. で評価済みなので除く。時柱は無ければ加えない（勝手に補完しない）。
  const otherBranchElements: Wuxing[] = [
    meishiki.year.branchElement,
    meishiki.day.branchElement,
  ];
  if (meishiki.time) otherBranchElements.push(meishiki.time.branchElement);
  for (const el of otherBranchElements) {
    const kind = supportKind(el, dayElement);
    if (kind === "same") score += c.branchSameElement;
    else if (kind === "supports") score += c.branchSupports;
    else score += c.branchDrains;
  }

  // --- 3. 日干以外の天干による支え ------------------------------------------
  // 日柱の天干＝日干そのものなので除く。
  const otherStems: Wuxing[] = [
    meishiki.year.stemElement,
    meishiki.month.stemElement,
  ];
  if (meishiki.time) otherStems.push(meishiki.time.stemElement);
  for (const el of otherStems) {
    const kind = supportKind(el, dayElement);
    if (kind === "same") score += c.stemSameElement;
    else if (kind === "supports") score += c.stemSupports;
    else score += c.stemDrains;
  }

  // --- 判定 -----------------------------------------------------------------
  let strength: Strength;
  if (score >= c.strongThreshold) strength = "strong";
  else if (score <= c.weakThreshold) strength = "weak";
  else strength = "neutral";

  const summary =
    strength === "strong"
      ? "生まれ持ったエネルギーが強めのタイプです。"
      : strength === "weak"
      ? "生まれ持ったエネルギーが穏やかなタイプです。"
      : "生まれ持ったエネルギーのバランスが取れたタイプです。";

  return { strength, score, rootedInMonth, summary };
}
