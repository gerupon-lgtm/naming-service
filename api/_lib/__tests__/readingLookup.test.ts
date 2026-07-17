import { describe, it, expect, vi } from "vitest";
import {
  toHiragana,
  splitMora,
  compositions,
  readingKanjiCandidates,
} from "../pet/readingLookup";

function mockReadingFetch(map: Record<string, string[]>): typeof fetch {
  return vi.fn(async (url: string) => {
    const seg = decodeURIComponent(String(url).split("/").pop() ?? "");
    const kanji = map[seg] ?? [];
    return {
      ok: kanji.length > 0,
      status: kanji.length > 0 ? 200 : 404,
      json: async () => ({ main_kanji: kanji, name_kanji: [] }),
    } as Response;
  }) as unknown as typeof fetch;
}

describe("よみ逆引き（F-004）", () => {
  it("カタカナ→ひらがな", () => {
    expect(toHiragana("モナカ")).toBe("もなか");
  });

  it("モーラ分割（小書き・長音は直前に結合）", () => {
    expect(splitMora("きゃりー")).toEqual(["きゃ", "りー"]);
    expect(splitMora("もなか")).toEqual(["も", "な", "か"]);
  });

  it("compositions: 2モーラ", () => {
    expect(compositions(2)).toEqual([[1, 1], [2]]);
  });

  it("読みを漢字に逆引きして合成する", async () => {
    const fetchImpl = mockReadingFetch({ も: ["百"], な: ["奈"] });
    const cands = await readingKanjiCandidates("もな", { fetchImpl });
    expect(cands.map((c) => c.name)).toContain("百奈");
    for (const c of cands) expect(c.reading).toBe("もな");
  });

  it("kanjiapi障害（全404）なら空", async () => {
    const fetchImpl = mockReadingFetch({});
    const cands = await readingKanjiCandidates("もな", { fetchImpl });
    expect(cands).toEqual([]);
  });
});
