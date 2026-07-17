import { describe, it, expect, vi } from "vitest";
import { fetchStrokeCount, KanjiApiUnavailableError } from "../kanjiapi";

function mockResponse(status: number, body?: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe("kanjiapi.dev クライアント（T-004）", () => {
  it("成功時は stroke_count を返す", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, { stroke_count: 12 })
    ) as unknown as typeof fetch;
    const n = await fetchStrokeCount("森", { fetchImpl });
    expect(n).toBe(12);
  });

  it("404 は未知文字として null を返す", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(404)) as unknown as typeof fetch;
    const n = await fetchStrokeCount("彁", { fetchImpl });
    expect(n).toBeNull();
  });

  it("5xx は1回リトライし、失敗継続なら KanjiApiUnavailableError", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(503)) as unknown as typeof fetch;
    await expect(fetchStrokeCount("山", { fetchImpl })).rejects.toBeInstanceOf(
      KanjiApiUnavailableError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2); // 1回リトライ
  });

  it("1回目5xx→2回目成功でリカバリする", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 1 ? mockResponse(500) : mockResponse(200, { stroke_count: 3 });
    }) as unknown as typeof fetch;
    const n = await fetchStrokeCount("川", { fetchImpl });
    expect(n).toBe(3);
  });

  it("接続エラー（throw）も KanjiApiUnavailableError に変換する", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(fetchStrokeCount("山", { fetchImpl })).rejects.toBeInstanceOf(
      KanjiApiUnavailableError
    );
  });
});
