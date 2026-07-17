// 三才配置（五行）。天格・人格・地格の画数を五行（木火土金水）に変換し、
// 相生・相剋の関係から吉凶を判定する。四柱推命など五行を使う他占術との連携用に、
// 五行サマリ（WuxingSummary）も出力する。

import { FortuneCategory } from "./fortuneTable81";

export type Wuxing = "wood" | "fire" | "earth" | "metal" | "water";

export const WUXING_LABEL: Record<Wuxing, string> = {
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
  water: "水",
};

/** 画数の一の位から五行を決める（1,2=木 / 3,4=火 / 5,6=土 / 7,8=金 / 9,0=水）。 */
export function wuxingOf(strokes: number): Wuxing {
  const d = strokes % 10;
  if (d === 1 || d === 2) return "wood";
  if (d === 3 || d === 4) return "fire";
  if (d === 5 || d === 6) return "earth";
  if (d === 7 || d === 8) return "metal";
  return "water"; // 9, 0
}

export type Relation = "相生" | "相剋" | "比和";

// 相生の順（各要素は次の要素を生む）: 木→火→土→金→水→木
const GENERATES: Record<Wuxing, Wuxing> = {
  wood: "fire",
  fire: "earth",
  earth: "metal",
  metal: "water",
  water: "wood",
};
// 相剋: 木剋土, 土剋水, 水剋火, 火剋金, 金剋木
const CONTROLS: Record<Wuxing, Wuxing> = {
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal",
  metal: "wood",
};

export function relationOf(a: Wuxing, b: Wuxing): Relation {
  if (a === b) return "比和";
  if (GENERATES[a] === b || GENERATES[b] === a) return "相生";
  if (CONTROLS[a] === b || CONTROLS[b] === a) return "相剋";
  return "相剋"; // 論理上ここには来ないが安全側
}

const RELATION_SCORE: Record<Relation, number> = {
  相生: 2,
  比和: 1,
  相剋: 0,
};

export interface SansaiResult {
  ten: Wuxing;
  jin: Wuxing;
  chi: Wuxing;
  tenLabel: string;
  jinLabel: string;
  chiLabel: string;
  relationTenJin: Relation;
  relationJinChi: Relation;
  category: FortuneCategory;
  categoryLabel: string;
  summary: string;
}

export interface WuxingSummary {
  // 三才（天・人・地）の3要素に含まれる五行の個数。四柱推命の命式五行と突合しやすい形。
  wood: number;
  fire: number;
  earth: number;
  metal: number;
  water: number;
  /** 最も多い五行。 */
  dominant: Wuxing;
  /** 三才に一つも現れない五行（＝名前が持たない要素。命式の不足補完の検討に使う）。 */
  lacking: Wuxing[];
}

const CATEGORY_LABEL: Record<FortuneCategory, string> = {
  daikichi: "大吉",
  kichi: "吉",
  hankichi: "半吉",
  kyo: "凶",
};

/** 天格・人格・地格の画数から三才配置と五行サマリを求める。 */
export function calcSansai(
  tenkaku: number,
  jinkaku: number,
  chikaku: number
): { sansai: SansaiResult; wuxing: WuxingSummary } {
  const ten = wuxingOf(tenkaku);
  const jin = wuxingOf(jinkaku);
  const chi = wuxingOf(chikaku);

  const relationTenJin = relationOf(ten, jin);
  const relationJinChi = relationOf(jin, chi);
  const score = RELATION_SCORE[relationTenJin] + RELATION_SCORE[relationJinChi];

  let category: FortuneCategory;
  if (score >= 4) category = "daikichi";
  else if (score === 3) category = "kichi";
  else if (score === 2) category = "hankichi";
  else category = "kyo";

  const summary = buildSansaiSummary(relationTenJin, relationJinChi, category);

  // 五行サマリ
  const counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const w of [ten, jin, chi]) counts[w] += 1;
  const dominant = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as Wuxing;
  const lacking = (Object.entries(counts)
    .filter(([, n]) => n === 0)
    .map(([k]) => k)) as Wuxing[];

  return {
    sansai: {
      ten,
      jin,
      chi,
      tenLabel: WUXING_LABEL[ten],
      jinLabel: WUXING_LABEL[jin],
      chiLabel: WUXING_LABEL[chi],
      relationTenJin,
      relationJinChi,
      category,
      categoryLabel: CATEGORY_LABEL[category],
      summary,
    },
    wuxing: { ...counts, dominant, lacking },
  };
}

function buildSansaiSummary(
  a: Relation,
  b: Relation,
  category: FortuneCategory
): string {
  if (category === "daikichi")
    return "天・人・地の五行が互いに生かし合い、心身ともに安定して発展しやすい good な配置です。";
  if (category === "kichi")
    return "五行の巡りがおおむね良く、周囲の助けを得ながら着実に伸びやすい配置です。";
  if (category === "hankichi")
    return `五行に生かし合い（${a}）と抑え合い（${b}）が混在し、環境しだいで運が振れやすい配置です。`;
  return "五行が互いに抑え合う関係で、無理を避け基礎固めを重視すると安定しやすい配置です。";
}
