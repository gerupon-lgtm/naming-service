// 生年月日・出生時刻の入力補助（F-015）。
//
// 【なぜテキスト入力を主にするか】
// ブラウザ標準の <input type="date"> は年に6桁以上を入力できてしまい（西暦275760年まで）、
// <input type="time"> は分の入力挙動がブラウザごとに不安定。
// そこで「8桁/4桁の数字テキスト入力」を主とし、ピッカーは併用手段として残す。
// 双方向に同期するので、どちらから入れても同じ結果になる。

/** 入力可能な最小の年（これより前は命式計算の想定外）。 */
export const MIN_YEAR = 1900;

/** 数字以外を除去し、指定桁数までに切り詰める。 */
export function digitsOnly(v: string, maxLen: number): string {
  return v.replace(/[^0-9]/g, "").slice(0, maxLen);
}

/** "19900505" -> "1990-05-05"。8桁でなければ null。 */
export function digits8ToIso(v: string): string | null {
  if (!/^\d{8}$/.test(v)) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

/** "1990-05-05" -> "19900505"。形式不正なら空文字。 */
export function isoToDigits8(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  return v.replace(/-/g, "");
}

/** "1030" -> "10:30"。4桁でなければ null。 */
export function digits4ToIso(v: string): string | null {
  if (!/^\d{4}$/.test(v)) return null;
  return `${v.slice(0, 2)}:${v.slice(2, 4)}`;
}

/** "10:30" -> "1030"。形式不正なら空文字。 */
export function isoToDigits4(v: string): string {
  if (!/^\d{2}:\d{2}$/.test(v)) return "";
  return v.replace(":", "");
}

/** 今日の日付（"YYYY-MM-DD"）。日付ピッカーの max に使う。 */
export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 生年月日の妥当性を検査する。
 * 生年月日は任意項目なので、**不正でも診断そのものは止めない**。
 * ここで返すのは欄の下に出す注意文（問題なければ null）。
 */
export function validateBirthDate(digits: string): string | null {
  if (digits === "") return null; // 未入力は正常（任意項目）
  if (digits.length < 8) return "生年月日は8桁で入力してください（例: 19900505）";

  const iso = digits8ToIso(digits);
  if (!iso) return "生年月日の形式が正しくありません";

  const [y, m, d] = iso.split("-").map(Number);
  if (y < MIN_YEAR) return `${MIN_YEAR}年以降で入力してください`;
  if (m < 1 || m > 12) return "月は01〜12で入力してください";
  if (d < 1 || d > 31) return "日は01〜31で入力してください";

  // 実在する日付か（2月30日などを弾く）
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return "存在しない日付です";
  }

  if (iso > todayIso()) return "未来の日付は入力できません";
  return null;
}

/**
 * 出生時刻の妥当性を検査する。未入力は正常（任意項目）。
 */
export function validateBirthTime(digits: string): string | null {
  if (digits === "") return null;
  if (digits.length < 4) return "出生時刻は4桁で入力してください（例: 0930）";

  const iso = digits4ToIso(digits);
  if (!iso) return "出生時刻の形式が正しくありません";

  const [h, mi] = iso.split(":").map(Number);
  if (h > 23) return "時は00〜23で入力してください";
  if (mi > 59) return "分は00〜59で入力してください";
  return null;
}
