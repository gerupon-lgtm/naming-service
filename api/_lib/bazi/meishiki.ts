// 命式（四柱）の算出。docs/integration-shichu.md 4.1 / 11章。
//
// 【厳守事項】
// - 日柱の dayOffset=10 は万年暦と照合済み（1900-01-01=甲戌 / 2000-01-01=戊午）。変更禁止。
// - 早子時説を採用（23:00〜23:59は翌日の日柱）。出生時刻入力時のみ適用し、
//   時差補正後の時刻で判定する。順序: 時差補正 → 早子時判定 → 日柱確定。
// - 節入りは固定テーブルではなく solarTerms.ts の天文計算を使う（①②の修正）。
// - 蔵干テーブルは子平式を既定とし、算命学式も設定値で切替可能（⑥）。
// - 出生時刻・出生地が未入力でも処理を止めない。未入力項目を勝手に補完しない。

import type {
  BaziInput,
  Branch,
  InputLevel,
  Meishiki,
  Pillar,
  Stem,
  Wuxing,
} from "./types";
import { findMonthTerm, getRisshunMs, JST_OFFSET_MS } from "./solarTerms";
import { calcTimeShiftMinutes } from "./longitude";

export const STEMS: Stem[] = [
  "甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸",
];
export const BRANCHES: Branch[] = [
  "子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥",
];

export const STEM_ELEMENT: Record<Stem, Wuxing> = {
  甲: "wood", 乙: "wood",
  丙: "fire", 丁: "fire",
  戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal",
  壬: "water", 癸: "water",
};

/** 地支の五行（本気ベース）。子=水, 丑=土, 寅=木 … */
export const BRANCH_ELEMENT: Record<Branch, Wuxing> = {
  子: "water", 丑: "earth", 寅: "wood", 卯: "wood",
  辰: "earth", 巳: "fire", 午: "fire", 未: "earth",
  申: "metal", 酉: "metal", 戌: "earth", 亥: "water",
};

// ============================================================
//  設定値（流派の選択。docs/integration-shichu.md 11.3.3 / 11.3.4）
// ============================================================

/**
 * ④ 早子時説。true なら 23:00〜23:59 生まれを翌日の日柱として扱う。
 * 【決定】採用（true）。出生時刻入力時のみ適用。
 */
export const BAZI_USE_EARLY_ZISHI = true;

/** ⑥ 蔵干テーブルの流派。既定は子平式。 */
export type ZoukanSchool = "shihei" | "sanmei";
export const BAZI_ZOUKAN_TABLE: ZoukanSchool = "shihei";

/**
 * 蔵干テーブル（余気→中気→本気の順、[天干, 日数]）。
 *
 * shihei（子平式・既定）: 移植元 diagnose.js の配分。
 * sanmei（算命学式）: 四正（子午卯酉）を「純粋な一行」として扱うのが特徴。
 *   12支中6つ（子・卯・午・申・酉・亥）が子平式と異なる。
 *   ※算命学は本来 時柱を使わない三柱の体系。採用時は時柱の扱いを別途整理すること。
 */
export const ZOUKAN_TABLES: Record<
  ZoukanSchool,
  Record<Branch, Array<[Stem, number]>>
> = {
  shihei: {
    子: [["壬", 10], ["癸", 20]],
    丑: [["癸", 9], ["辛", 3], ["己", 18]],
    寅: [["戊", 7], ["丙", 7], ["甲", 16]],
    卯: [["甲", 10], ["乙", 20]],
    辰: [["乙", 9], ["癸", 3], ["戊", 18]],
    巳: [["戊", 5], ["庚", 9], ["丙", 16]],
    午: [["丙", 10], ["己", 9], ["丁", 11]],
    未: [["丁", 9], ["乙", 3], ["己", 18]],
    申: [["戊", 7], ["壬", 7], ["庚", 16]],
    酉: [["庚", 10], ["辛", 20]],
    戌: [["辛", 9], ["丁", 3], ["戊", 18]],
    亥: [["戊", 7], ["甲", 5], ["壬", 18]],
  },
  sanmei: {
    子: [["癸", 30]],
    丑: [["癸", 9], ["辛", 3], ["己", 18]],
    寅: [["戊", 7], ["丙", 7], ["甲", 16]],
    卯: [["乙", 30]],
    辰: [["乙", 9], ["癸", 3], ["戊", 18]],
    巳: [["戊", 5], ["庚", 9], ["丙", 16]],
    午: [["己", 19], ["丁", 11]],
    未: [["丁", 9], ["乙", 3], ["己", 18]],
    申: [["戊", 10], ["壬", 3], ["庚", 17]],
    酉: [["辛", 30]],
    戌: [["辛", 9], ["丁", 3], ["戊", 18]],
    亥: [["甲", 12], ["壬", 18]],
  },
};

/** 経過日数から月支の分野蔵干を引く。 */
export function pickZoukan(
  branch: Branch,
  daysFromTerm: number,
  school: ZoukanSchool = BAZI_ZOUKAN_TABLE
): Stem {
  const table = ZOUKAN_TABLES[school][branch];
  let acc = 0;
  for (const [stem, dur] of table) {
    acc += dur;
    if (daysFromTerm < acc) return stem;
  }
  return table[table.length - 1][0]; // 範囲を超えたら本気
}

// ============================================================
//  日柱
// ============================================================

/**
 * 日柱の60干支インデックス。
 * 基準 1900-01-01 = 甲戌（通番10）。**この offset は万年暦照合済み。変更禁止。**
 */
const DAY_PILLAR_BASE_MS = Date.UTC(1900, 0, 1);
const DAY_PILLAR_OFFSET = 10;

export function dayPillarIndex(utcMidnightMs: number): number {
  const days = Math.floor((utcMidnightMs - DAY_PILLAR_BASE_MS) / 86400000);
  return ((days + DAY_PILLAR_OFFSET) % 60 + 60) % 60;
}

function pillarOf(stemIdx: number, branchIdx: number): Pillar {
  const stem = STEMS[((stemIdx % 10) + 10) % 10];
  const branch = BRANCHES[((branchIdx % 12) + 12) % 12];
  return {
    stem,
    branch,
    stemElement: STEM_ELEMENT[stem],
    branchElement: BRANCH_ELEMENT[branch],
  };
}

// ============================================================
//  命式の組み立て
// ============================================================

/**
 * 入力レベルを判定する。
 * L1: 生年月日のみ / L2: ＋出生時刻 / L3: ＋出生地
 */
export function detectLevel(input: BaziInput): InputLevel {
  if (!input.birthTime) return "L1";
  if (!input.birthPlace) return "L2";
  return "L3";
}

/**
 * 命式を組み立てる。
 *
 * 生年月日だけで判定を完了できる（L1＝三柱）。出生時刻・出生地は任意で、
 * 未入力なら該当要素を計算から外す（勝手に補完しない）。
 */
export function buildMeishiki(input: BaziInput): Meishiki {
  const level = detectLevel(input);

  // --- 基準時刻の決定 ---------------------------------------------------
  //
  // 【重要】2つの時間軸を使い分ける。混同すると9時間ずれる。
  //   jstPseudoMs : JSTの暦日・時刻を Date.UTC() で表した疑似UTC値。
  //                 日柱（暦日で決まる）と早子時の判定に使う。
  //                 日柱の基準 1900-01-01=甲戌 もJSTの暦日基準なのでこちらで揃える。
  //   instantMs   : 真の瞬間（UTC）。節入り・立春との比較に使う。
  //                 節入りは天文計算で求めた実時刻なので、こちらで比較しないとずれる。
  const [y, m, d] = input.birthDate.split("-").map(Number);
  const jstMidnightPseudoMs = Date.UTC(y, m - 1, d);

  let hour: number | null = null;
  let minute = 0;
  if (input.birthTime) {
    const [hh, mm] = input.birthTime.split(":").map(Number);
    hour = hh;
    minute = mm || 0;
  }

  // 時刻未入力なら「その日の正午」ではなく 0時 を使う。
  // （正午とみなすと未入力項目を補完したことになるため。勝手な仮定を置かない）
  let jstPseudoMs = jstMidnightPseudoMs;
  let timeShiftMinutes = 0;

  if (hour !== null) {
    jstPseudoMs = jstMidnightPseudoMs + hour * 3600000 + minute * 60000;
    // --- 時差補正（L3のみ。出生地未入力なら 0）-------------------------
    timeShiftMinutes = calcTimeShiftMinutes(
      new Date(jstPseudoMs - JST_OFFSET_MS),
      input.birthPlace
    );
    jstPseudoMs += Math.round(timeShiftMinutes * 60000);
  }

  // JSTの疑似UTC値 → 真の瞬間（UTC）
  const instantMs = jstPseudoMs - JST_OFFSET_MS;

  // --- 早子時（④）: 時差補正後の時刻で判定する ---------------------------
  // 23:00〜23:59 は翌日の日柱として扱う。時刻未入力（L1）では適用しない。
  let earlyZishiApplied = false;
  let dayForPillarMs = jstMidnightPseudoMs;
  if (hour !== null) {
    // 補正で日をまたぐ場合があるため、補正後の値から取り直す
    const corrected = new Date(jstPseudoMs);
    const correctedMidnight = Date.UTC(
      corrected.getUTCFullYear(),
      corrected.getUTCMonth(),
      corrected.getUTCDate()
    );
    dayForPillarMs = correctedMidnight;
    if (BAZI_USE_EARLY_ZISHI && corrected.getUTCHours() >= 23) {
      dayForPillarMs = correctedMidnight + 86400000;
      earlyZishiApplied = true;
    }
  }

  // --- 年柱（立春で切替。固定の2/4ではなく天文計算）----------------------
  // 立春はJSTの年で引く。真の瞬間どうしで比較する。
  const jstYear = new Date(jstPseudoMs).getUTCFullYear();
  const risshunMs = getRisshunMs(jstYear);
  const yearForPillar = instantMs < risshunMs ? jstYear - 1 : jstYear;
  const yearIdx = ((yearForPillar - 4) % 60 + 60) % 60;
  const yearStemIdx = yearIdx % 10;
  const year = pillarOf(yearStemIdx, yearIdx % 12);

  // --- 月柱（節入りベース）-----------------------------------------------
  const monthTerm = findMonthTerm(instantMs);
  const monthBranchIdx = monthTerm.term.branchIndex;
  // 五虎遁: 年干group=yearStem%5。寅月の月干先頭を group*2+2 とし、寅からの経過月を加算
  const monthsFromTiger = (monthBranchIdx - 2 + 12) % 12;
  const monthStemIdx = ((yearStemIdx % 5) * 2 + 2 + monthsFromTiger) % 10;
  const month = pillarOf(monthStemIdx, monthBranchIdx);

  // 月支の分野蔵干（節入りからの経過日数）
  const monthZoukan = pickZoukan(month.branch, monthTerm.daysFromTerm);

  // --- 日柱 ---------------------------------------------------------------
  const dayIdx = dayPillarIndex(dayForPillarMs);
  const dayStemIdx = dayIdx % 10;
  const day = pillarOf(dayStemIdx, dayIdx % 12);

  // --- 時柱（出生時刻がある場合のみ）--------------------------------------
  // 時支は「その土地の時刻」で決まるため、真の瞬間(UTC)ではなく
  // jstPseudoMs（＝時差補正後のJST時刻）から時を取ること。
  // instantMs を使うと9時間ずれる（23時→14時と誤読し、子ではなく未になる）。
  let time: Pillar | null = null;
  if (hour !== null) {
    const h = new Date(jstPseudoMs).getUTCHours();
    const timeBranchIdx = Math.floor(((h + 1) % 24) / 2);
    const timeStemIdx = ((dayStemIdx % 5) * 2 + timeBranchIdx) % 10;
    time = pillarOf(timeStemIdx, timeBranchIdx);
  }

  // --- 五行カウント -------------------------------------------------------
  const gogyoCount: Record<Wuxing, number> = {
    wood: 0, fire: 0, earth: 0, metal: 0, water: 0,
  };
  const pillars: Pillar[] = [year, month, day];
  if (time) pillars.push(time);
  for (const p of pillars) {
    gogyoCount[p.stemElement] += 1;
    gogyoCount[p.branchElement] += 1;
  }
  // 月令（月支の分野蔵干）は命式で最も強く作用するため加算する
  gogyoCount[STEM_ELEMENT[monthZoukan]] += 1;

  return {
    year,
    month,
    day,
    time,
    dayElement: day.stemElement,
    monthZoukan,
    gogyoCount,
    level,
    earlyZishiApplied,
    timeShiftMinutes,
  };
}
