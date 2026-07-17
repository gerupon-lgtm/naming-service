import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  lookupStrokes,
  UnknownCharacterError,
  KanjiApiUnavailableError,
  _clearRuntimeCache,
} from "../characterMaster";

function mockResponse(status: number, body?: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe("characterMaster + kanjiapi フォールバック（T-004）", () => {
  beforeEach(() => _clearRuntimeCache());

  it("seedにある文字はAPIを呼ばない", async () => {
    const fetchImpl = vi.fn();
    const s = await lookupStrokes("山田", {
      kanjiApi: { fetchImpl: fetchImpl as unknown as typeof fetch },
    });
    expect(s).toEqual([3, 5]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("未知文字はkanjiapiで取得し、2回目はキャッシュから返す（書き込み1回）", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, { stroke_count: 16 })
    ) as unknown as typeof fetch;
    const deps = { kanjiApi: { fetchImpl } };
    // 「檜」はseed未登録
    const s1 = await lookupStrokes("檜", deps);
    expect(s1).toEqual([16]);
    const s2 = await lookupStrokes("檜", deps);
    expect(s2).toEqual([16]);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 2回目はキャッシュ
  });

  it("kanjiapiにも無い(404)文字は UnknownCharacterError", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(404)) as unknown as typeof fetch;
    await expect(
      lookupStrokes("彁", { kanjiApi: { fetchImpl } })
    ).rejects.toBeInstanceOf(UnknownCharacterError);
  });

  it("kanjiapi障害は KanjiApiUnavailableError を伝播（SERVICE_UNAVAILABLE）", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(503)) as unknown as typeof fetch;
    await expect(
      lookupStrokes("彁", { kanjiApi: { fetchImpl } })
    ).rejects.toBeInstanceOf(KanjiApiUnavailableError);
  });

  it("disableRemoteならAPIを呼ばず未知文字扱い", async () => {
    const fetchImpl = vi.fn();
    await expect(
      lookupStrokes("彁", {
        disableRemote: true,
        kanjiApi: { fetchImpl: fetchImpl as unknown as typeof fetch },
      })
    ).rejects.toBeInstanceOf(UnknownCharacterError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
