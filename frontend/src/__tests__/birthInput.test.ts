import { describe, it, expect } from "vitest";
import {
  digitsOnly,
  digits8ToIso,
  digits4ToIso,
  isoToDigits8,
  isoToDigits4,
  validateBirthDate,
  validateBirthTime,
  MIN_YEAR,
} from "../birthInput";

describe("数字入力の正規化", () => {
  it("数字以外を取り除く", () => {
    expect(digitsOnly("1990/05/05", 8)).toBe("19900505");
    expect(digitsOnly("09:30", 4)).toBe("0930");
    expect(digitsOnly("あ1い2う3", 8)).toBe("123");
  });

  it("指定桁数で切り詰める（年に6桁以上入る問題を防ぐ）", () => {
    expect(digitsOnly("199005051234", 8)).toBe("19900505");
    expect(digitsOnly("123456", 4)).toBe("1234");
  });
});

describe("形式変換（テキストとピッカーの同期）", () => {
  it("8桁 <-> ISO日付", () => {
    expect(digits8ToIso("19900505")).toBe("1990-05-05");
    expect(isoToDigits8("1990-05-05")).toBe("19900505");
  });

  it("4桁 <-> ISO時刻", () => {
    expect(digits4ToIso("0930")).toBe("09:30");
    expect(isoToDigits4("09:30")).toBe("0930");
  });

  it("桁数が足りなければ null（ピッカーに中途半端な値を渡さない）", () => {
    expect(digits8ToIso("1990")).toBeNull();
    expect(digits4ToIso("09")).toBeNull();
  });

  it("往復しても値が変わらない", () => {
    for (const d of ["19900505", "20001231", "19010101"]) {
      expect(isoToDigits8(digits8ToIso(d)!)).toBe(d);
    }
    for (const t of ["0000", "0930", "2359"]) {
      expect(isoToDigits4(digits4ToIso(t)!)).toBe(t);
    }
  });
});

describe("生年月日の検査（任意項目なので診断は止めない）", () => {
  it("未入力は正常扱い", () => {
    expect(validateBirthDate("")).toBeNull();
  });

  it("正しい日付は通る", () => {
    expect(validateBirthDate("19900505")).toBeNull();
    expect(validateBirthDate("20000229")).toBeNull(); // 閏年
  });

  it("桁数不足は注意を返す", () => {
    expect(validateBirthDate("1990")).toContain("8桁");
  });

  it("存在しない日付を弾く", () => {
    expect(validateBirthDate("19900230")).toBe("存在しない日付です");
    expect(validateBirthDate("20010229")).toBe("存在しない日付です"); // 平年
  });

  it("月・日の範囲外を弾く", () => {
    expect(validateBirthDate("19901305")).toContain("月は");
    expect(validateBirthDate("19900532")).toContain("日は");
  });

  it("下限より前の年を弾く", () => {
    expect(validateBirthDate("18991231")).toContain(`${MIN_YEAR}`);
  });

  it("未来の日付を弾く", () => {
    const next = new Date();
    next.setFullYear(next.getFullYear() + 1);
    const p = (n: number) => String(n).padStart(2, "0");
    const future = `${next.getFullYear()}${p(next.getMonth() + 1)}${p(next.getDate())}`;
    expect(validateBirthDate(future)).toContain("未来");
  });
});

describe("出生時刻の検査", () => {
  it("未入力は正常扱い", () => {
    expect(validateBirthTime("")).toBeNull();
  });

  it("正しい時刻は通る", () => {
    expect(validateBirthTime("0000")).toBeNull();
    expect(validateBirthTime("0930")).toBeNull();
    expect(validateBirthTime("2359")).toBeNull();
  });

  it("桁数不足は注意を返す", () => {
    expect(validateBirthTime("09")).toContain("4桁");
  });

  it("時・分の範囲外を弾く（分の入力ミスを拾う）", () => {
    expect(validateBirthTime("2400")).toContain("時は");
    expect(validateBirthTime("0960")).toContain("分は");
    expect(validateBirthTime("0999")).toContain("分は");
  });
});
