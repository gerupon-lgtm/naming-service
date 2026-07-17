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
    expect(r.rank).toBe("A");
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
    expect(["SS", "S", "A", "B", "C"]).toContain(r.rank);
  });
});
