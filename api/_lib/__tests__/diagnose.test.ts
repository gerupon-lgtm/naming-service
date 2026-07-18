import { describe, it, expect } from "vitest";
import {
  diagnose,
  InvalidInputError,
  DiagnosisUnavailableError,
} from "../diagnose";

describe("diagnose（姓名診断オーケストレーション）", () => {
  it("山田太郎を診断できる（熊崎式・郎は⻏補正で13画）", async () => {
    const r = await diagnose({ sei: "山田", mei: "太郎" });
    // 山3 田5 太4 郎13（郎は右阝=邑を7画に補正）
    expect(r.tenkaku).toBe(8); // 山3+田5
    expect(r.jinkaku).toBe(9); // 田5+太4
    expect(r.chikaku).toBe(17); // 太4+郎13
    expect(r.gaikaku).toBe(16); // 総25−人9
    expect(r.soukaku).toBe(25); // 3+5+4+13
    expect(r.strokeTotal).toBe(25);
    expect(r.score).toBe(69);
    expect(r.rank).toBe("中吉"); // 69点 → 中吉（62〜75）
    expect(r.sex).toBe("unspecified");
  });

  it("拡張情報（各格詳細・三才・五行）を返す", async () => {
    const r = await diagnose({ sei: "山田", mei: "太郎" });
    expect(r.details).toHaveLength(5);
    const jin = r.details.find((d) => d.key === "jinkaku")!;
    expect(jin.label).toBe("人格");
    expect(jin.nickname).toBe("本質（中心）");
    expect(jin.strokes).toBe(9);
    expect(jin.categoryLabel).toBeTruthy();
    expect(jin.keyword).toBeTruthy();
    expect(jin.plain).toBeTruthy();
    expect(r.sansai.categoryLabel).toBeTruthy();
    expect(r.sansai.tenLabel).toBeTruthy();
    expect(["wood", "fire", "earth", "metal", "water"]).toContain(
      r.wuxing.dominant
    );
  });

  it("成り立ち（chars と各格の構成文字members）を返す", async () => {
    const r = await diagnose({ sei: "山田", mei: "太郎" });
    expect(r.chars.map((c) => c.char)).toEqual(["山", "田", "太", "郎"]);
    expect(r.chars[0].part).toBe("sei");
    expect(r.chars[3].part).toBe("mei");
    const byKey = Object.fromEntries(r.details.map((d) => [d.key, d.members]));
    expect(byKey.tenkaku).toEqual([0, 1]); // 山田
    expect(byKey.jinkaku).toEqual([1, 2]); // 田太
    expect(byKey.chikaku).toEqual([2, 3]); // 太郎
    expect(byKey.gaikaku).toEqual([0, 3]); // 山郎
    expect(byKey.soukaku).toEqual([0, 1, 2, 3]);
  });

  it("性別を指定でき、結果に反映される", async () => {
    // 性別による吉凶差の詳細は gender.test.ts（calcScore）で検証。
    // ここでは sex がそのまま返り、両方とも正常に診断できることを確認。
    const male = await diagnose({ sei: "山田", mei: "太郎", sex: "male" });
    const female = await diagnose({ sei: "山田", mei: "太郎", sex: "female" });
    expect(male.sex).toBe("male");
    expect(female.sex).toBe("female");
    expect(["大吉", "吉", "中吉", "小吉", "末吉", "凶"]).toContain(female.rank);
  });

  it("前後の空白を正規化する", async () => {
    const r = await diagnose({ sei: "  山田 ", mei: " 太郎  " });
    expect(r.soukaku).toBe(25);
  });

  it("姓が空なら InvalidInputError", async () => {
    await expect(diagnose({ sei: "", mei: "太郎" })).rejects.toBeInstanceOf(
      InvalidInputError
    );
  });

  it("名が空なら InvalidInputError", async () => {
    await expect(diagnose({ sei: "山田", mei: "  " })).rejects.toBeInstanceOf(
      InvalidInputError
    );
  });

  it("seed/kanjiapiに無い文字は DiagnosisUnavailableError（未知文字を列挙）", async () => {
    try {
      // disableRemote でkanjiapi.devを呼ばず、seedに無い文字を未知扱いにする
      await diagnose({ sei: "山田", mei: "彁", lookup: { disableRemote: true } });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(DiagnosisUnavailableError);
      expect((e as DiagnosisUnavailableError).characters).toContain("彁");
    }
  });

  it("1文字姓・1文字名でも計算が破綻しない", async () => {
    const r = await diagnose({ sei: "林", mei: "一" });
    expect(r.tenkaku).toBe(9);
    expect(r.chikaku).toBe(2);
    expect(r.soukaku).toBe(9);
    expect(["大吉", "吉", "中吉", "小吉", "末吉", "凶"]).toContain(r.rank);
  });
});
