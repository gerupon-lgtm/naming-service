// character_master への画数参照。
//
// 参照順: seed（メモリ） → ランタイムキャッシュ → kanjiapi.dev（未知文字フォールバック, T-004）。
// 本番では seed/キャッシュ部分を Neon(Postgres) の character_master に置き換える。
// kanjiapi.dev から取得した画数はキャッシュに書き込み（source='kanjiapi'）、
// 再検索時はキャッシュのみで完結する（書き込みは1回）。

import seed from "../../db/seed/character_master.seed.json";
import {
  fetchStrokeCount,
  KanjiApiUnavailableError,
  type KanjiApiDeps,
} from "./kanjiapi";
import { isDbEnabled, dbGetStroke, dbInsertStroke } from "./db";

export interface CharacterRecord {
  character: string;
  stroke_count: number;
  character_type: "kanji" | "hiragana" | "katakana" | "roman" | "symbol";
  source: "seed" | "kanjiapi";
  note?: string;
}

const SEED_MAP: Map<string, CharacterRecord> = new Map(
  (seed as CharacterRecord[]).map((r) => [r.character, r])
);

// kanjiapi.dev 取得結果のランタイムキャッシュ（本番では character_master への INSERT に置換）。
const RUNTIME_CACHE: Map<string, number> = new Map();

/** 未知文字を表すエラー。呼び出し側で DIAGNOSIS_UNAVAILABLE に変換する。 */
export class UnknownCharacterError extends Error {
  constructor(public readonly characters: string[]) {
    super(`unknown characters: ${characters.join(", ")}`);
    this.name = "UnknownCharacterError";
  }
}

export { KanjiApiUnavailableError };

export interface LookupDeps {
  /** kanjiapi.dev 依存の差し替え（テスト用）。未指定なら実 fetch を使う。 */
  kanjiApi?: KanjiApiDeps;
  /** true の場合、seed/キャッシュに無くても kanjiapi.dev を呼ばない（純ローカル計算用）。 */
  disableRemote?: boolean;
}

/** seed／メモリキャッシュのみの同期参照。 */
function localStroke(ch: string): number | undefined {
  const rec = SEED_MAP.get(ch);
  if (rec) return rec.stroke_count;
  if (RUNTIME_CACHE.has(ch)) return RUNTIME_CACHE.get(ch);
  return undefined;
}

/** seed → メモリ → DB の順に参照する（DB無効時はseed/メモリのみ）。 */
async function storedStroke(ch: string): Promise<number | undefined> {
  const local = localStroke(ch);
  if (local !== undefined) return local;
  if (isDbEnabled()) {
    const fromDb = await dbGetStroke(ch);
    if (fromDb !== undefined) {
      RUNTIME_CACHE.set(ch, fromDb); // 同一リクエスト内の再参照を高速化
      return fromDb;
    }
  }
  return undefined;
}

/**
 * 文字列を1文字ずつ画数に変換する。
 * seed/キャッシュに無い文字は kanjiapi.dev に問い合わせ、取得できればキャッシュする。
 * kanjiapi.dev にも無い文字は集約して UnknownCharacterError を投げる。
 *
 * @throws UnknownCharacterError seed/kanjiapi いずれにも無い文字を含む → DIAGNOSIS_UNAVAILABLE
 * @throws KanjiApiUnavailableError kanjiapi.dev 障害 → SERVICE_UNAVAILABLE
 */
export async function lookupStrokes(
  text: string,
  deps: LookupDeps = {}
): Promise<number[]> {
  const chars = Array.from(text);
  const strokes: number[] = [];
  const unknown: string[] = [];

  for (const ch of chars) {
    const stored = await storedStroke(ch);
    if (stored !== undefined) {
      strokes.push(stored);
      continue;
    }
    if (deps.disableRemote) {
      unknown.push(ch);
      continue;
    }
    // 未知文字 → kanjiapi.dev フォールバック（障害時は例外を伝播＝SERVICE_UNAVAILABLE）
    const remote = await fetchStrokeCount(ch, deps.kanjiApi);
    if (remote === null) {
      unknown.push(ch); // kanjiapi.dev にも無い
    } else {
      RUNTIME_CACHE.set(ch, remote); // メモリキャッシュ
      if (isDbEnabled()) {
        // character_master にキャッシュINSERT（書き込みは1回・以後はDB参照で完結）
        await dbInsertStroke(ch, remote, "kanji");
      }
      strokes.push(remote);
    }
  }

  if (unknown.length > 0) throw new UnknownCharacterError(unknown);
  return strokes;
}

/** テスト・デバッグ用：seed/キャッシュのみの同期取得（未登録なら undefined）。 */
export function strokeCountOf(ch: string): number | undefined {
  return localStroke(ch);
}

/** テスト用：ランタイムキャッシュをクリアする。 */
export function _clearRuntimeCache(): void {
  RUNTIME_CACHE.clear();
}
