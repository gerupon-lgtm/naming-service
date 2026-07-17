import { describe, it, expect } from "vitest";
import {
  diagnose,
  InvalidInputError,
  DiagnosisUnavailableError,
} from "../diagnose";

describe("diagnose（姓名診断オーケストレーション）", () => {
  it("山田太郎を診断できる（五格・スコア・ランク）", async () => {
    const r = await diagnose({ sei: "山田", mei: "太郎" });
    expect(r.tenkaku).toBe(8);
    expect(r.jinkaku).toBe(9);
    expect(r.chikaku).toBe(13);
    expect(r.gaikaku).toBe(12);
    expect(r.soukaku).toBe(21);
    expect(r.strokeTotal).toBe(21);
    expect(r.score).toBe(65);
    expect(r.rank).toBe("中吉"); // 65点 → 中吉（62〜75）
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

  it("性別を指定でき、女性の注意数はスコアに反映される", async () => {
    const male = await diagnose({ sei: "山田", mei: "太郎", sex: "male" });
    const female = await diagnose({ sei: "山田", mei: "太郎", sex: "female" });
    expect(male.sex).toBe("male");
    expect(female.sex).toBe("female");
    // 山田太郎は総格21（女性の注意数）なので、女性はスコアが下がる
    expect(female.score).toBeLessThan(male.score);
    // 該当格に注記が付く
    const sou = female.details.find((d) => d.key === "soukaku")!;
    expect(sou.caution).toBeTruthy();
  });

  it("前後の空白を正規化する", async () => {
    const r = await diagnose({ sei: "  山田 ", mei: " 太郎  " });
    expect(r.soukaku).toBe(21);
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
