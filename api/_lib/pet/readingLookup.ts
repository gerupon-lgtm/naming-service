// よみがな逆引きによる漢字名の合成（F-004・T-103）。
//
// 希望よみ → モーラ分割 → 各セグメント（連続モーラ）を kanjiapi.dev 読み逆引きで
// 漢字化 → 組み合わせて漢字名を合成する。名前は最大5文字、呼び出し数・候補数は上限で抑制。

import {
  fetchReadingKanji,
  type KanjiApiReadingDeps,
} from "../kanjiapiReading";

export interface ReadingKanjiCandidate {
  name: string; // 合成した漢字名
  reading: string; // 元の希望よみ（全体）
}

const MAX_MORA = 5; // これ以上長いよみは漢字合成しない
const MAX_PART_MORA = 3; // 1漢字が受け持つモーラ数の上限
const MAX_PARTS = 5; // 名前の漢字数上限
const PER_SEGMENT = 3; // 1セグメントあたり採用する漢字数
const MAX_CANDIDATES = 24; // 合成候補の総数上限

const SMALL = new Set([
  "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "っ", "ゃ", "ゅ", "ょ", "ゎ", "ゕ", "ゖ", "ー",
]);

/** カタカナ→ひらがな。 */
export function toHiragana(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

/** よみをモーラ単位に分割（小書き仮名・長音は直前に結合）。 */
export function splitMora(reading: string): string[] {
  const mora: string[] = [];
  for (const ch of Array.from(reading)) {
    if (SMALL.has(ch) && mora.length > 0) {
      mora[mora.length - 1] += ch;
    } else {
      mora.push(ch);
    }
  }
  return mora;
}

/** n 個のモーラを、各パート 1..maxPart、パート数 ≤ maxParts に分ける全パターン（サイズ列）。 */
export function compositions(
  n: number,
  maxPart = MAX_PART_MORA,
  maxParts = MAX_PARTS
): number[][] {
  const out: number[][] = [];
  const rec = (rest: number, acc: number[]) => {
    if (rest === 0) {
      out.push([...acc]);
      return;
    }
    if (acc.length >= maxParts) return;
    for (let s = 1; s <= Math.min(maxPart, rest); s++) {
      acc.push(s);
      rec(rest - s, acc);
      acc.pop();
    }
  };
  rec(n, []);
  return out;
}

/**
 * 希望よみから漢字名候補を合成する。kanjiapi.dev 障害時は空配列。
 */
export async function readingKanjiCandidates(
  reading: string,
  deps: KanjiApiReadingDeps = {}
): Promise<ReadingKanjiCandidate[]> {
  const hira = toHiragana((reading ?? "").trim());
  if (!hira) return [];
  const mora = splitMora(hira);
  if (mora.length === 0 || mora.length > MAX_MORA) return [];

  // セグメント（連続モーラの結合文字列）ごとに漢字を取得（キャッシュ）
  const cache = new Map<string, string[]>();
  const getKanji = async (seg: string): Promise<string[]> => {
    if (cache.has(seg)) return cache.get(seg)!;
    const list = (await fetchReadingKanji(seg, deps)).slice(0, PER_SEGMENT);
    cache.set(seg, list);
    return list;
  };

  const names = new Set<string>();
  const result: ReadingKanjiCandidate[] = [];

  for (const sizes of compositions(mora.length)) {
    // サイズ列 → セグメント文字列の配列
    const segs: string[] = [];
    let idx = 0;
    for (const sz of sizes) {
      segs.push(mora.slice(idx, idx + sz).join(""));
      idx += sz;
    }
    // 各セグメントの漢字候補
    const optionLists: string[][] = [];
    let ok = true;
    for (const seg of segs) {
      const ks = await getKanji(seg);
      if (ks.length === 0) {
        ok = false;
        break;
      }
      optionLists.push(ks);
    }
    if (!ok) continue;

    // 直積（上限付き）
    let combos: string[] = [""];
    for (const opts of optionLists) {
      const next: string[] = [];
      for (const prefix of combos) {
        for (const k of opts) {
          next.push(prefix + k);
          if (next.length >= MAX_CANDIDATES) break;
        }
        if (next.length >= MAX_CANDIDATES) break;
      }
      combos = next;
    }
    for (const name of combos) {
      if (names.has(name)) continue;
      names.add(name);
      result.push({ name, reading: hira });
      if (result.length >= MAX_CANDIDATES) return result;
    }
  }
  return result;
}
