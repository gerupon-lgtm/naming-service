import { describe, it, expect } from "vitest";
import {
  getCandidates,
  getAllCategories,
  seedCandidates,
} from "../pet/nameMaster";

describe("name_master（DB優先・seedフォールバック）", () => {
  it("DB無効時は seed 候補を返す（十分な件数）", async () => {
    const c = await getCandidates();
    expect(c).toBe(seedCandidates());
    expect(c.length).toBeGreaterThanOrEqual(150); // 拡充後の候補数
  });

  it("各候補が必要な項目を持つ", async () => {
    const c = await getCandidates();
    for (const x of c.slice(0, 20)) {
      expect(x.name).toBeTruthy();
      expect(x.reading).toBeTruthy();
      expect(["hiragana", "katakana", "kanji"]).toContain(x.type);
      expect(x.targets.length).toBeGreaterThan(0);
      expect(x.genders.length).toBeGreaterThan(0);
    }
  });

  it("カテゴリ一覧を返す", async () => {
    const cats = await getAllCategories();
    expect(cats).toContain("かわいい");
    expect(cats.length).toBeGreaterThan(3);
  });
});
