import { describe, it, expect } from "vitest";
import {
  getSolarTermsOfYear,
  getRisshunMs,
  findMonthTerm,
  JST_OFFSET_MS,
  jstDayStart,
} from "../solarTerms";
import { buildMeishiki } from "../meishiki";

/** UTCミリ秒 → JSTの "YYYY-MM-DD HH:mm" */
function toJst(ms: number): string {
  const d = new Date(ms + JST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  );
}

/** JSTの日付部分だけ */
function jstDate(ms: number): string {
  return toJst(ms).slice(0, 10);
}

// ============================================================
//  立春の実日付（外部の暦と突き合わせる検証）
//
//  【重要】構造テスト（12個ある・昇順・2月にある）だけでは、9時間ずれの
//  ような不具合を検出できない。実際の日付を固定値で検証する。
//  2021年の立春が2月3日だったことは「124年ぶり」として広く報じられた。
// ============================================================

describe("立春の実日付（JST）", () => {
  it("2021年の立春は2月3日（124年ぶりの2/3）", () => {
    expect(jstDate(getRisshunMs(2021))).toBe("2021-02-03");
  });

  it("2020年・2022年・2023年・2024年の立春は2月4日", () => {
    expect(jstDate(getRisshunMs(2020))).toBe("2020-02-04");
    expect(jstDate(getRisshunMs(2022))).toBe("2022-02-04");
    expect(jstDate(getRisshunMs(2023))).toBe("2023-02-04");
    expect(jstDate(getRisshunMs(2024))).toBe("2024-02-04");
  });

  it("立春は2/3〜2/5の範囲に収まる（1950〜2050年を全走査）", () => {
    for (let y = 1950; y <= 2050; y++) {
      const d = jstDate(getRisshunMs(y));
      expect(d.startsWith(`${y}-02-0`)).toBe(true);
      const day = Number(d.slice(-2));
      expect(day).toBeGreaterThanOrEqual(3);
      expect(day).toBeLessThanOrEqual(5);
    }
  });

  it("固定テーブルではない（年により日付が変わる）", () => {
    const days = [2019, 2020, 2021, 2022].map((y) =>
      Number(jstDate(getRisshunMs(y)).slice(-2))
    );
    expect(new Set(days).size).toBeGreaterThan(1);
  });
});

// ============================================================
//  タイムゾーンの扱い
// ============================================================

describe("JSTとUTCの取り違え防止", () => {
  it("jstDayStart はJSTの暦日の0時に丸める", () => {
    // JST 2000-01-02 08:00 = UTC 2000-01-01 23:00
    const ms = Date.UTC(2000, 0, 1, 23, 0);
    expect(jstDate(jstDayStart(ms))).toBe("2000-01-02");
  });

  it("節入りの経過日数がJSTの暦日で数えられている", () => {
    const info = findMonthTerm(Date.UTC(2000, 5, 15) - JST_OFFSET_MS);
    expect(info.daysFromTerm).toBeGreaterThanOrEqual(0);
    expect(info.daysFromTerm).toBeLessThan(32);
  });
});

// ============================================================
//  立春境界の年柱（9時間ずれがあると壊れる）
// ============================================================

describe("立春境界での年柱切替", () => {
  it("2021年は2/3が立春なので、2/2生まれと2/4生まれで年柱が変わる", () => {
    const before = buildMeishiki({ birthDate: "2021-02-02" });
    const after = buildMeishiki({ birthDate: "2021-02-04" });
    expect(before.year.stem + before.year.branch).not.toBe(
      after.year.stem + after.year.branch
    );
    // 2020年=庚子, 2021年=辛丑
    expect(before.year.stem + before.year.branch).toBe("庚子");
    expect(after.year.stem + after.year.branch).toBe("辛丑");
  });

  it("2022年は2/4が立春なので、2/3生まれはまだ前年の年柱", () => {
    const before = buildMeishiki({ birthDate: "2022-02-03" });
    const after = buildMeishiki({ birthDate: "2022-02-05" });
    // 2021年=辛丑, 2022年=壬寅
    expect(before.year.stem + before.year.branch).toBe("辛丑");
    expect(after.year.stem + after.year.branch).toBe("壬寅");
  });

  it("立春当日でも、時刻を入れれば節入り時刻の前後で年柱が分かれる", () => {
    const risshun = getRisshunMs(2021);
    const hourJst = new Date(risshun + JST_OFFSET_MS).getUTCHours();
    // 立春時刻より確実に前と後
    const early = buildMeishiki({
      birthDate: "2021-02-03",
      birthTime: "00:00",
    });
    const late = buildMeishiki({
      birthDate: "2021-02-03",
      birthTime: "23:00",
    });
    // 立春が0時ちょうどでない限り、早朝は前年・深夜は当年になる
    if (hourJst > 0 && hourJst < 23) {
      expect(early.year.stem + early.year.branch).toBe("庚子");
      expect(late.year.stem + late.year.branch).toBe("辛丑");
    }
  });
});

// ============================================================
//  節入りの一覧（目視確認用・常に成功する）
// ============================================================

describe("節入り一覧の出力（万年暦との突き合わせ用）", () => {
  it("2026年の節入り日時を出力する", () => {
    const terms = getSolarTermsOfYear(2026);
    const lines = terms.map((t) => `${t.term.name} ${toJst(t.ms)}`);
    // eslint-disable-next-line no-console
    console.log("\n[2026年の節入り(JST)]\n" + lines.join("\n"));
    expect(terms).toHaveLength(12);
  });
});
