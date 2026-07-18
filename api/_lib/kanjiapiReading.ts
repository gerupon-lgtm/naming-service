// kanjiapi.dev 読み逆引きクライアント（F-004）。
// GET /v1/reading/{reading} → { reading, main_kanji: string[], name_kanji: string[] }
// 指定の読みを持つ「1文字の漢字」を返す。障害・404時は空配列（呼び出し側で無視）。

const BASE_URL = process.env.KANJIAPI_BASE_URL ?? "https://kanjiapi.dev";
const TIMEOUT_MS = Number(process.env.KANJIAPI_TIMEOUT_MS ?? 5000);

export interface KanjiApiReadingDeps {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

const CJK = /^[一-鿿々]$/;

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 指定の読み（ひらがな）を持つ1文字漢字の一覧を返す。
 * main_kanji（主要な読み）＋ name_kanji（名乗り）の和集合。失敗時は []。
 */
export async function fetchReadingKanji(
  reading: string,
  deps: KanjiApiReadingDeps = {}
): Promise<string[]> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const baseUrl = deps.baseUrl ?? BASE_URL;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const url = `${baseUrl}/v1/reading/${encodeURIComponent(reading)}`;
  try {
    const res = await fetchWithTimeout(url, timeoutMs, fetchImpl);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      main_kanji?: string[];
      name_kanji?: string[];
    };
    const all = [...(data.main_kanji ?? []), ...(data.name_kanji ?? [])];
    const uniq = Array.from(new Set(all)).filter((k) => CJK.test(k));
    return uniq;
  } catch {
    return []; // 障害・タイムアウトは無視（かな候補・マスタ候補は残る）
  }
}
