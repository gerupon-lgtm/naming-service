// かな → ヘボン式ローマ字変換（F-003・v2.4.0）。
//
// 「使いたい文字」にアルファベットを指定した場合、名前のローマ字表記に
// その字が含まれるかを判定するために使う。表示（出力文字種=ローマ字）にも使う。
//
// 【方針】
// - ヘボン式（パスポート標準）: し=shi, つ=tsu, ち=chi, ふ=fu, じ=ji。
// - 撥音「ん」は b/m/p の前で m（Namba, Honda）。それ以外は n。
// - 促音「っ」は次の子音を重ねる（ch の前は t: まっちゃ=matcha）。
// - 長音は**記号（マクロン）を使わず**、かなのとおり母音を並べる（とう→tou）。
//   ペット名では厳密な長音表記より、字が素直に対応するほうが「使いたい文字」の
//   判定に向くため。ヘボン式の長音マクロンは採用しない（この簡略化は許容）。

const HEPBURN: Record<string, string> = {
  // 清音
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  // 濁音・半濁音
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ゔ: "vu",
  // 小書き単独（拗音の一部にならなかった場合）
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
  ゃ: "ya", ゅ: "yu", ょ: "yo", ゎ: "wa",
};

// 拗音（2文字で1音）
const YOON: Record<string, string> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo",
  ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  // 外来音の一部（ペット名で使われうるもの）
  しぇ: "she", ちぇ: "che", じぇ: "je",
  てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du",
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo",
  うぃ: "wi", うぇ: "we", うぉ: "wo",
  ゔぁ: "va", ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo",
};

/** カタカナ→ひらがな（変換前に揃える）。 */
function toHiragana(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

/** 促音の後、次の音の頭を重ねる（ch の前は t）。 */
function geminate(next: string): string {
  if (!next) return "";
  if (next.startsWith("ch")) return "t";
  const first = next[0];
  // 母音始まりは重ねない
  if ("aiueo".includes(first)) return "";
  return first;
}

/**
 * かな（ひらがな・カタカナ混在可）をヘボン式ローマ字に変換する。
 * かな以外の文字はそのまま通す（漢字が残るよみは想定しないが保険）。
 */
export function romajiOf(reading: string): string {
  const s = toHiragana(reading ?? "");
  let out = "";
  let sokuon = false; // 直前が「っ」

  const chars = Array.from(s);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // 促音
    if (ch === "っ") {
      sokuon = true;
      continue;
    }

    // 長音符「ー」: 直前の母音を繰り返す
    if (ch === "ー") {
      const last = out[out.length - 1];
      if (last && "aiueo".includes(last)) out += last;
      continue;
    }

    // 拗音（2文字）を優先
    const pair = ch + (chars[i + 1] ?? "");
    let roma: string | undefined;
    if (YOON[pair]) {
      roma = YOON[pair];
      i++; // 2文字消費
    } else {
      roma = HEPBURN[ch];
    }

    if (roma === undefined) {
      // 未知の文字はそのまま（英字・記号など）
      out += ch;
      sokuon = false;
      continue;
    }

    // 撥音「ん」の後続同化: b/m/p の前は m
    if (ch === "ん") {
      const nextPair = chars[i + 1] ?? "";
      const nextRoma = YOON[nextPair + (chars[i + 2] ?? "")] ?? HEPBURN[chars[i + 1] ?? ""] ?? "";
      roma = /^[bmp]/.test(nextRoma) ? "m" : "n";
    }

    if (sokuon) {
      out += geminate(roma);
      sokuon = false;
    }
    out += roma;
  }

  return out;
}

/** 名前として表示するローマ字（先頭大文字）。 */
export function romajiName(reading: string): string {
  const r = romajiOf(reading);
  return r ? r[0].toUpperCase() + r.slice(1) : r;
}
