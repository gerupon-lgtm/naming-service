// kanjiapi.dev クライアント（T-004・F-007）。
// 未知文字の画数取得にのみ使用する。障害時のフォールバックAPIは実装しない方針。
//
// 熊崎式の部首補正はkanjiapi.devの画数に反映されないため、ここで取得した画数は
// 補正なしの現代画数である（source='kanjiapi'）。稀な文字でのみ熊崎式と差が出る限界を許容する。

const BASE_URL = process.env.KANJIAPI_BASE_URL ?? "https://kanjiapi.dev";
const TIMEOUT_MS = Number(process.env.KANJIAPI_TIMEOUT_MS ?? 5000);

/** kanjiapi.dev 自体が応答しない・5xx を返す（障害）。SERVICE_UNAVAILABLE に対応。 */
export class KanjiApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KanjiApiUnavailableError";
  }
}

export interface KanjiApiDeps {
  /** テスト用に差し替え可能な fetch。既定は globalThis.fetch。 */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

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
 * 1文字の画数を kanjiapi.dev から取得する。
 * @returns 画数（見つかった場合）／ null（404: kanjiapi.devにも存在しない＝未知文字）
 * @throws KanjiApiUnavailableError タイムアウト・接続エラー・5xx（1回リトライ後も失敗）
 */
export async function fetchStrokeCount(
  character: string,
  deps: KanjiApiDeps = {}
): Promise<number | null> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const baseUrl = deps.baseUrl ?? BASE_URL;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const url = `${baseUrl}/v1/kanji/${encodeURIComponent(character)}`;

  // 失敗時は1回だけリトライ（計2回試行）
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs, fetchImpl);
      if (res.status === 404) return null; // 未知文字（kanjiapi.devにも無い）
      if (res.status >= 500) {
        lastErr = new KanjiApiUnavailableError(`kanjiapi.dev ${res.status}`);
        continue; // リトライ
      }
      if (!res.ok) {
        // 4xx（404以外）は未知文字扱いにせず障害として扱う
        throw new KanjiApiUnavailableError(`kanjiapi.dev ${res.status}`);
      }
      const data = (await res.json()) as { stroke_count?: number };
      if (typeof data.stroke_count !== "number") {
        throw new KanjiApiUnavailableError("kanjiapi.dev: stroke_count missing");
      }
      return data.stroke_count;
    } catch (e) {
      lastErr = e;
      // AbortError（タイムアウト）・ネットワークエラー → リトライ
    }
  }
  throw new KanjiApiUnavailableError(
    `kanjiapi.dev unreachable: ${String(lastErr)}`
  );
}
