import { describe, it, expect } from "vitest";
import {
  buildMeishiki,
  dayPillarIndex,
  detectLevel,
  pickZoukan,
  ZOUKAN_TABLES,
  STEMS,
  BRANCHES,
} from "../meishiki";
import { getRisshunMs, getSolarTermsOfYear } from "../solarTerms";

// ============================================================
//  日柱: 万年暦との突き合わせ（移植元の誤りも検出するための独立検証）
//
//  docs/integration-shichu.md 11.4 の通り、「diagnose.js と一致」だけでは
//  移植元自体が持つずれを検出できない。万年暦（keisan.site 暦注計算）の
//  既知データと突き合わせる。
//  検証済み: 1900-01-01 = 甲戌 / 2000-01-01 = 戊午
// ============================================================

function dayPillarOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const idx = dayPillarIndex(Date.UTC(y, m - 1, d));
  return STEMS[idx % 10] + BRANCHES[idx % 12];
}

describe("日柱（万年暦との突き合わせ）", () => {
  it("1900-01-01 は 甲戌", () => {
    expect(dayPillarOf("1900-01-01")).toBe("甲戌");
  });

  it("2000-01-01 は 戊午", () => {
    expect(dayPillarOf("2000-01-01")).toBe("戊午");
  });

  it("60日周期が連続している（1900-01-01の60日後は再び甲戌）", () => {
    const base = Date.UTC(1900, 0, 1);
    const after60 = base + 60 * 86400000;
    expect(dayPillarIndex(base)).toBe(dayPillarIndex(after60));
  });

  it("2件の間隔（36524日 = 60で余り44）と整合する", () => {
    const a = dayPillarIndex(Date.UTC(1900, 0, 1));
    const b = dayPillarIndex(Date.UTC(2000, 0, 1));
    expect((a + 44) % 60).toBe(b);
  });
});

// ============================================================
//  年柱（立春切替）
// ============================================================

describe("年柱", () => {
  it("1900年は庚子", () => {
    const m = buildMeishiki({ birthDate: "1900-06-01" });
    expect(m.year.stem + m.year.branch).toBe("庚子");
  });

  it("2000年は庚辰", () => {
    const m = buildMeishiki({ birthDate: "2000-06-01" });
    expect(m.year.stem + m.year.branch).toBe("庚辰");
  });

  it("立春より前の生まれは前年の年柱になる", () => {
    // 1月生まれは必ず立春前
    const jan = buildMeishiki({ birthDate: "2000-01-15" });
    const jun = buildMeishiki({ birthDate: "2000-06-15" });
    expect(jan.year.stem + jan.year.branch).not.toBe(
      jun.year.stem + jun.year.branch
    );
    // 1999年＝己卯
    expect(jan.year.stem + jan.year.branch).toBe("己卯");
  });

  // 立春の実日付（JST）の検証は solarTerms.test.ts で行う。
  // ここでUTCの日付を見ると9時間ずれを見逃すため、あえて重複させない。
});

// ============================================================
//  節入り
// ============================================================

describe("節入り（solarTerms）", () => {
  it("1年に12個の節が求まり、時刻昇順に並ぶ", () => {
    const terms = getSolarTermsOfYear(2000);
    expect(terms).toHaveLength(12);
    for (let i = 1; i < terms.length; i++) {
      expect(terms[i].ms).toBeGreaterThan(terms[i - 1].ms);
    }
  });

});

// ============================================================
//  入力レベルと縮退（生年月日だけで判定できること）
// ============================================================

describe("入力レベルと縮退動作", () => {
  it("生年月日のみは L1（三柱・時柱なし）", () => {
    const m = buildMeishiki({ birthDate: "1990-05-05" });
    expect(m.level).toBe("L1");
    expect(m.time).toBeNull();
    expect(m.timeShiftMinutes).toBe(0);
    expect(m.earlyZishiApplied).toBe(false);
  });

  it("＋出生時刻は L2（四柱・経度補正なし）", () => {
    const m = buildMeishiki({ birthDate: "1990-05-05", birthTime: "10:30" });
    expect(m.level).toBe("L2");
    expect(m.time).not.toBeNull();
    expect(m.timeShiftMinutes).toBe(0); // 出生地なしなら経度補正しない
  });

  it("＋出生地は L3（時差補正あり）", () => {
    const m = buildMeishiki({
      birthDate: "1990-05-05",
      birthTime: "10:30",
      birthPlace: "13", // 東京
    });
    expect(m.level).toBe("L3");
    expect(m.timeShiftMinutes).not.toBe(0);
  });

  it("L1でも五行カウントが成立する（時柱ぶんが無いだけ）", () => {
    const m = buildMeishiki({ birthDate: "1990-05-05" });
    const total = Object.values(m.gogyoCount).reduce((a, b) => a + b, 0);
    // 三柱=天干3+地支3、＋月令蔵干1 = 7
    expect(total).toBe(7);
  });

  it("L2/L3では時柱が加わり五行カウントが増える", () => {
    const m = buildMeishiki({ birthDate: "1990-05-05", birthTime: "10:30" });
    const total = Object.values(m.gogyoCount).reduce((a, b) => a + b, 0);
    // 四柱=天干4+地支4、＋月令蔵干1 = 9
    expect(total).toBe(9);
  });

  it("detectLevel が入力に応じたレベルを返す", () => {
    expect(detectLevel({ birthDate: "2000-01-01" })).toBe("L1");
    expect(detectLevel({ birthDate: "2000-01-01", birthTime: "12:00" })).toBe("L2");
    expect(
      detectLevel({ birthDate: "2000-01-01", birthTime: "12:00", birthPlace: "13" })
    ).toBe("L3");
  });
});

// ============================================================
//  ④ 早子時
// ============================================================

describe("早子時（23時台は翌日の日柱）", () => {
  it("23:30生まれは翌日の日柱になる", () => {
    const at22 = buildMeishiki({ birthDate: "2000-01-01", birthTime: "22:30" });
    const at23 = buildMeishiki({ birthDate: "2000-01-01", birthTime: "23:30" });
    expect(at22.earlyZishiApplied).toBe(false);
    expect(at23.earlyZishiApplied).toBe(true);
    // 2000-01-01=戊午 の翌日 2000-01-02=己未
    expect(at22.day.stem + at22.day.branch).toBe("戊午");
    expect(at23.day.stem + at23.day.branch).toBe("己未");
  });

  it("時刻未入力（L1）では早子時を適用しない", () => {
    const m = buildMeishiki({ birthDate: "2000-01-01" });
    expect(m.earlyZishiApplied).toBe(false);
    expect(m.day.stem + m.day.branch).toBe("戊午");
  });

  it("23時台でも時支は子", () => {
    const m = buildMeishiki({ birthDate: "2000-01-01", birthTime: "23:30" });
    expect(m.time?.branch).toBe("子");
  });
});

// ============================================================
//  時柱（JST時刻で決まること。UTCと取り違えると9時間ずれる）
// ============================================================

describe("時支の割り当て（全時間帯）", () => {
  // 子=23:00-00:59, 丑=01:00-02:59, 寅=03:00-04:59 …
  const cases: Array<[string, string]> = [
    ["00:30", "子"],
    ["01:30", "丑"],
    ["03:30", "寅"],
    ["05:30", "卯"],
    ["07:30", "辰"],
    ["09:30", "巳"],
    ["11:30", "午"],
    ["13:30", "未"],
    ["15:30", "申"],
    ["17:30", "酉"],
    ["19:30", "戌"],
    ["21:30", "亥"],
    ["23:30", "子"],
  ];

  for (const [time, branch] of cases) {
    it(`${time} の時支は ${branch}`, () => {
      const m = buildMeishiki({ birthDate: "2000-06-15", birthTime: time });
      expect(m.time?.branch).toBe(branch);
    });
  }

  it("時差補正を入れても時支はJST基準で決まる（大きくずれない）", () => {
    // 東京は約+19分。11:50 + 19分 = 12:09 で午のまま
    const m = buildMeishiki({
      birthDate: "2000-06-15",
      birthTime: "11:50",
      birthPlace: "13",
    });
    expect(m.time?.branch).toBe("午");
  });
});

// ============================================================
//  ⑥ 蔵干テーブル（子平式 / 算命学式）
// ============================================================

describe("蔵干テーブルの流派切替", () => {
  it("子平式と算命学式で異なるのは 子・卯・午・申・酉・亥 の6支", () => {
    const diff: string[] = [];
    for (const b of BRANCHES) {
      const a = JSON.stringify(ZOUKAN_TABLES.shihei[b]);
      const c = JSON.stringify(ZOUKAN_TABLES.sanmei[b]);
      if (a !== c) diff.push(b);
    }
    expect(diff.sort()).toEqual(["亥", "午", "卯", "子", "申", "酉"].sort());
  });

  it("算命学式では子・卯・酉が単一の蔵干（純粋な一行）", () => {
    expect(ZOUKAN_TABLES.sanmei["子"]).toHaveLength(1);
    expect(ZOUKAN_TABLES.sanmei["卯"]).toHaveLength(1);
    expect(ZOUKAN_TABLES.sanmei["酉"]).toHaveLength(1);
  });

  it("各テーブルの日数合計は30", () => {
    for (const school of ["shihei", "sanmei"] as const) {
      for (const b of BRANCHES) {
        const total = ZOUKAN_TABLES[school][b].reduce((s, [, d]) => s + d, 0);
        expect(total).toBe(30);
      }
    }
  });

  it("経過日数に応じて余気→中気→本気と切り替わる", () => {
    // 子平式の寅: 戊7 → 丙7 → 甲16
    expect(pickZoukan("寅", 0, "shihei")).toBe("戊");
    expect(pickZoukan("寅", 6, "shihei")).toBe("戊");
    expect(pickZoukan("寅", 7, "shihei")).toBe("丙");
    expect(pickZoukan("寅", 13, "shihei")).toBe("丙");
    expect(pickZoukan("寅", 14, "shihei")).toBe("甲");
  });

  it("亥の前半は子平式=戊(土)、算命学式=甲(木) で結論が変わる", () => {
    expect(pickZoukan("亥", 3, "shihei")).toBe("戊");
    expect(pickZoukan("亥", 3, "sanmei")).toBe("甲");
  });
});
