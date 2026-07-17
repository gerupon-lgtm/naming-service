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

/** DATABASE_URL が設定されているか（＝DBを使うか）。 */
export function isDbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Neon の sql タグ付きテンプレート関数を取得（遅延初期化）。DB無効時は null。 */
async function getSql(): Promise<NeonSql | null> {
  if (!isDbEnabled()) return null;
  if (!_sqlPromise) {
    _sqlPromise = (async () => {
      const { neon } = await import("@neondatabase/serverless");
      return neon(process.env.DATABASE_URL as string) as unknown as NeonSql;
    })();
  }
  return _sqlPromise;
}

/**
 * character_master から1文字の画数を取得する。
 * @returns 画数／未登録なら undefined／DB無効なら undefined
 */
export async function dbGetStroke(character: string): Promise<number | undefined> {
  const sql = await getSql();
  if (!sql) return undefined;
  const rows = await sql`
    SELECT stroke_count FROM character_master WHERE character = ${character} LIMIT 1
  `;
  if (rows.length === 0) return undefined;
  return Number(rows[0].stroke_count);
}

/**
 * kanjiapi.dev 取得値を character_master にキャッシュINSERTする（source='kanjiapi'）。
 * 既に存在すれば何もしない（ON CONFLICT DO NOTHING）。DB無効時は no-op。
 */
export async function dbInsertStroke(
  character: string,
  strokeCount: number,
  characterType = "kanji"
): Promise<void> {
  const sql = await getSql();
  if (!sql) return;
  await sql`
    INSERT INTO character_master (character, stroke_count, character_type, source)
    VALUES (${character}, ${strokeCount}, ${characterType}, 'kanjiapi')
    ON CONFLICT (character) DO NOTHING
  `;
}

/** 接続確認用（ヘルスチェック等）。DB無効なら { enabled:false }。 */
export async function dbPing(): Promise<{ enabled: boolean; ok?: boolean }> {
  const sql = await getSql();
  if (!sql) return { enabled: false };
  try {
    await sql`SELECT 1`;
    return { enabled: true, ok: true };
  } catch {
    return { enabled: true, ok: false };
  }
}
