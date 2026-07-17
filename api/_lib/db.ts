// Neon(Postgres) 接続（T-002）。
//
// 方針:
// - DATABASE_URL が設定されていれば Neon を使う。未設定なら DB 無効（seed JSON＋メモリのみで動作）。
// - Vercel Functions（サーバーレス）向けに @neondatabase/serverless の HTTP ドライバを使う。
//   コネクションプールを持たず、1リクエストで完結するので serverless と相性が良い。
// - @neondatabase/serverless は「動的 import」で遅延読み込みする。DB を使わない環境
//   （ローカル開発・テスト）ではパッケージ未インストールでも他の機能が壊れないようにするため。

type NeonSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

let _sqlPromise: Promise<NeonSql> | null = null;
/** 直近のDB初期化エラー（health等で原因表示に使う）。 */
let _lastInitError: string | null = null;

/** DATABASE_URL が設定されているか（＝DBを使うか）。 */
export function isDbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Neon の sql タグ付きテンプレート関数を取得（遅延初期化）。
 * DB無効時・初期化失敗時は null を返す（例外を投げない＝呼び出し側を落とさない）。
 */
async function getSql(): Promise<NeonSql | null> {
  if (!isDbEnabled()) return null;
  if (!_sqlPromise) {
    _sqlPromise = (async () => {
      const { neon } = await import("@neondatabase/serverless");
      return neon(process.env.DATABASE_URL as string) as unknown as NeonSql;
    })();
  }
  try {
    return await _sqlPromise;
  } catch (e) {
    _lastInitError = String(e).slice(0, 300);
    _sqlPromise = null; // 次回再試行できるようにリセット
    return null;
  }
}

/**
 * character_master から1文字の画数を取得する。
 * DB無効・エラー時は undefined（呼び出し側は seed/kanjiapi にフォールバックする）。
 */
export async function dbGetStroke(character: string): Promise<number | undefined> {
  try {
    const sql = await getSql();
    if (!sql) return undefined;
    const rows = await sql`
      SELECT stroke_count FROM character_master WHERE character = ${character} LIMIT 1
    `;
    if (rows.length === 0) return undefined;
    return Number(rows[0].stroke_count);
  } catch {
    return undefined; // DBエラーは無視して seed/kanjiapi にフォールバック
  }
}

/**
 * kanjiapi.dev 取得値を character_master にキャッシュINSERTする（source='kanjiapi'）。
 * 既に存在すれば何もしない。DB無効・エラー時は no-op（診断本体を止めない）。
 */
export async function dbInsertStroke(
  character: string,
  strokeCount: number,
  characterType = "kanji"
): Promise<void> {
  try {
    const sql = await getSql();
    if (!sql) return;
    await sql`
      INSERT INTO character_master (character, stroke_count, character_type, source)
      VALUES (${character}, ${strokeCount}, ${characterType}, 'kanjiapi')
      ON CONFLICT (character) DO NOTHING
    `;
  } catch {
    // キャッシュ書き込み失敗は無視（次回また取得すればよい）
  }
}

/**
 * 接続確認用（ヘルスチェック等）。
 * - DATABASE_URL 未設定: { enabled:false }
 * - 設定あり・接続OK: { enabled:true, ok:true }
 * - 設定あり・失敗: { enabled:true, ok:false, error:"理由" }
 * 例外は投げない（health を落とさない）。
 */
export async function dbPing(): Promise<{
  enabled: boolean;
  ok?: boolean;
  error?: string;
}> {
  if (!isDbEnabled()) return { enabled: false };
  try {
    const sql = await getSql();
    if (!sql) {
      return { enabled: true, ok: false, error: _lastInitError ?? "初期化に失敗" };
    }
    await sql`SELECT 1`;
    return { enabled: true, ok: true };
  } catch (e) {
    return { enabled: true, ok: false, error: String(e).slice(0, 300) };
  }
}
