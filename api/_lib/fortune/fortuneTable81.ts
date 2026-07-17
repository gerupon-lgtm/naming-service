// 熊崎式 81画 吉凶テーブル（初期ルールセット・調整可能な設定値）。
//
// 各数（1〜81）に吉凶カテゴリを割り当て、カテゴリごとの品質値（0〜100）で
// スコア算出に用いる。82 以上は 81 を引いて 1〜81 に丸める（81画還元）。
//
// 注意: 81画の吉凶分類は文献により差異がある。本テーブルは代表的な分類に基づく
// 初期値であり、CLAUDE.md の方針どおり実装中に調整可能とする。

export type FortuneCategory = "daikichi" | "kichi" | "hankichi" | "kyo";

/** カテゴリ→品質値（0〜100）。スコア算出の重み合成に使う。調整可能。 */
export const CATEGORY_QUALITY: Record<FortuneCategory, number> = {
  daikichi: 100, // 大吉
  kichi: 85, // 吉
  hankichi: 55, // 半吉（吉凶相半）
  kyo: 25, // 凶
};

/** 1〜81 の吉凶分類（初期ルールセット）。 */
export const FORTUNE_TABLE_81: Record<number, FortuneCategory> = {
  1: "daikichi", 2: "kyo", 3: "daikichi", 4: "kyo", 5: "daikichi",
  6: "daikichi", 7: "kichi", 8: "kichi", 9: "kyo", 10: "kyo",
  11: "daikichi", 12: "kyo", 13: "daikichi", 14: "kyo", 15: "daikichi",
  16: "daikichi", 17: "kichi", 18: "kichi", 19: "kyo", 20: "kyo",
  21: "daikichi", 22: "kyo", 23: "daikichi", 24: "daikichi", 25: "kichi",
  26: "kyo", 27: "kyo", 28: "kyo", 29: "kichi", 30: "hankichi",
  31: "daikichi", 32: "daikichi", 33: "daikichi", 34: "kyo", 35: "kichi",
  36: "kyo", 37: "daikichi", 38: "hankichi", 39: "daikichi", 40: "hankichi",
  41: "daikichi", 42: "kyo", 43: "kyo", 44: "kyo", 45: "daikichi",
  46: "kyo", 47: "daikichi", 48: "daikichi", 49: "kyo", 50: "kyo",
  51: "hankichi", 52: "daikichi", 53: "kyo", 54: "kyo", 55: "hankichi",
  56: "kyo", 57: "kichi", 58: "hankichi", 59: "kyo", 60: "kyo",
  61: "kichi", 62: "kyo", 63: "daikichi", 64: "kyo", 65: "daikichi",
  66: "kyo", 67: "kichi", 68: "kichi", 69: "kyo", 70: "kyo",
  71: "hankichi", 72: "kyo", 73: "hankichi", 74: "kyo", 75: "hankichi",
  76: "kyo", 77: "hankichi", 78: "hankichi", 79: "kyo", 80: "kyo",
  81: "daikichi",
};

/** 画数を 1〜81 に還元する（82以上は 81 を減算、繰り返し）。 */
export function reduceTo81(strokes: number): number {
  let n = strokes;
  while (n > 81) n -= 80; // 81画還元（81を超えたら80を引く＝1〜81に収める）
  if (n < 1) n = 1;
  return n;
}

/** 画数に対応する吉凶カテゴリを返す。 */
export function categoryOf(strokes: number): FortuneCategory {
  return FORTUNE_TABLE_81[reduceTo81(strokes)];
}

/** 画数に対応する品質値（0〜100）を返す。 */
export function qualityOf(strokes: number): number {
  return CATEGORY_QUALITY[categoryOf(strokes)];
}
