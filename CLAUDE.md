# 命名サービス（姓名診断＋ペット命名提案）

## 概要
姓名判断エンジンを使い、(1) 既存の姓名を診断する機能と、(2) その逆利用でペット（犬・猫・小動物）の命名候補を提案する機能を提供する無料Webサービス。個人開発・低コスト運用が前提。

## 前提（仮置き）
- フロントエンドはReact + Vite + TypeScript（当初のGitHub Pages案は非採用。Vercelが静的配信も担当）
- バックエンドAPIはVercel Functions（Node.js + TypeScript）。フロントと同一Vercelプロジェクト・同一ドメイン
- 【想定】DBはNeon（Postgres無料枠）。Vercel Functionsはファイルシステムが永続化されないため、SQLite等のファイルDBは採用しない
- 【想定】スコア→ランク（SS〜C）の閾値は初期値を仮設定し、実装中に調整可能な設定値として持つ
- 【想定】Ollamaの「応答不可」判定はタイムアウト5秒＋HTTP 5xx／接続エラー
- 【想定】LLMフォールバック順・使用モデルは環境変数で管理する（下記参照）
- 将来的にOCI VPSへ移行予定。DB・API実装は移行を見据え、特定ホスティングに強く依存しない構成にする

## 技術スタック
- 言語/FW: TypeScript、React + Vite（フロント）、Vercel Functions（API）
- DB: Neon（Postgres無料枠）
- **デプロイ【確定・実装済】: フロント・APIとも1つのVercelプロジェクトにまとめて公開（同一ドメイン＝CORS不要）。** 本番URL: naming-service-red.vercel.app。GitHub連携で自動デプロイ。将来 OCI VPS へ移行（当初の「フロント=GitHub Pages／API=Vercel」案は非採用）
- 認証: なし（MVP時点。将来検討）
- LLM: Ollama（自宅サーバー、第一候補） → OpenRouter（無料枠モデル、フォールバック）

## ディレクトリ構成（実装済）
```
/frontend       React + Vite（Vercelがビルドし frontend/dist を静的配信）
/api            Vercel Functions（TypeScript）※各 .ts が1エンドポイント
/api/_lib       姓名判断ロジック・kanjiapi.devクライアント・LLMクライアント・DBクライアント等
                （先頭 _ でVercelのFunction化対象外。旧 api/lib から改名）
/db             マイグレーション・シード・接続確認/移行スクリプト
/docs           本設計ドキュメント一式
vercel.json     framework:null / buildCommand / outputDirectory=frontend/dist
package.json（ルート） build で frontend をビルド、API実行時依存を宣言
```

## デプロイ上の必須事項【実装で確定】
- `/api` のTS関数は **CommonJSで統一**する。`api/package.json` に `"type": "module"` を置かず、`api/tsconfig.json` は `"module": "CommonJS" / "moduleResolution": "node"`。拡張子なしのimportを使うため、ESMだと `ERR_MODULE_NOT_FOUND`、片方だけCJSだと `Cannot use import statement outside a module` になる。**この設定は変更しないこと。**
- `/api` 配下で関数にしたくない共有コードは必ず `api/_lib`（先頭 `_`）に置く。
- 環境変数（DATABASE_URL, LLM_*, KANJIAPI_*）はVercelダッシュボードで設定。`DATABASE_URL` 未設定時は同梱seed辞書にフォールバックして動作する。
- ローカルのVercel CLIが不調な環境のため、公開は **GitHub web upload → Vercel import** で運用（CLIは使わない）。

## 規約
- 機能実装時は `docs/tasks.md` のタスクID（例: T-001）をコミットメッセージに含める
- 姓名診断結果・命名候補データはDBに永続化しない（診断結果）／永続化する（命名候補マスタ）の区別を厳守する（`docs/data-model.md` 参照）
- 環境変数はすべて `.env.example` に列挙し、実値はコミットしない

## コマンド（想定）
- フロント開発サーバ: `npm run dev`（frontend/）
- API開発サーバ: `vercel dev`
- テスト: `npm test`

## 環境変数（LLMフォールバック関連）
```
LLM_FALLBACK_ORDER=ollama,openrouter
LLM_OLLAMA_ENDPOINT=<自宅サーバーの公開URL>
LLM_OLLAMA_MODEL=gemma4:31b-cloud
LLM_OPENROUTER_API_KEY=<APIキー>
LLM_OPENROUTER_MODEL=google/gemma-4-31b-it:free
LLM_TIMEOUT_MS=10000
```
- 総合ランクは6段階（大吉/吉/中吉/小吉/末吉/凶）。各下限は `api/_lib/fortune/score.ts` の設定値（大吉90/吉76/中吉62/小吉48/末吉34/凶）。表示は言葉が主役・点数は参考値。
- LLM応答不可判定は **タイムアウト10秒＋HTTP 4xx/5xx・接続エラー**（v1.15決定）。

## 実装上の注意
- 姓名診断（F-001）は `character_master` を都度参照して画数計算する。DBに存在しない文字は kanjiapi.dev から取得しキャッシュする（書き込みは1回のみ、以後はDB参照）
- 流派は熊崎式を採用する。将来複数流派に対応できるよう、計算ロジックは流派を差し替え可能な構造にしておくが、Phase1では熊崎式のみをハードコードし `fortune_method` テーブルは作らない
- 熊崎式は一部の部首で伝統的な画数補正（氵→水4、⻖→阜8、⻏→邑7 等）を行うが、kanjiapi.devの画数はこれを反映しない。シードは補正済み画数で持つ（source=seed）。自動キャッシュされた未知文字（source=kanjiapi）はこの補正が反映されない限界がある。
- **【v1.16実装済】部首補正は自動化**: `db/build-seed.cjs`（ビルド時のみ）でオフラインパッケージ `kanji-data`（現代画数）＋`kanji`（`kanjiTree`部品分解）を使い、部首グリフ（氵扌艹忄⺨⻖⻏王礻衤⻌）を検出して `radical_corrections.json` の補正値を加算する。**RapidAPIキー不要**（当初のKanji alive／MuzukanjiAPI案は非採用）。シードは常用＋人名用 約3,096字。再生成: `npm i kanji-data kanji && node db/build-seed.cjs` → `python3 db/build-seed-sql.py`。補正適用文字は `db/seed/correction_review.json` に監査用出力。月(肉づき)のみ字形が月(つき)と同じで自動判別できず未補正（手動確認対象）。
- 命名候補提案（F-002以降）はPhase2で着手する。Phase1（MVP）は姓名診断＋そのLLMコメント生成（F-012）までを対象とする
- kanjiapi.devの障害時はエラー表示のみとし、フォールバックAPIは実装しない（`docs/tasks.md` 参照）
- LLMコメント生成（F-011, F-012）はOllama優先、応答不可時のみOpenRouterにフォールバックする。フォールバック順・モデルは環境変数で変更可能にする
- LLMコメントは「ロジックで確定した結果への肉付け」役に徹する。診断結果の数値・ランクはロジック側で確定させ、LLMに再計算させない
- 診断結果本体は即時表示し、LLMコメントは非同期で後から表示する（コメント生成の遅延で診断結果表示を待たせない）

## 参照
- 要件定義書: `命名サービス_要件定義書.md`（機能IDはここを正とする）
- データ構造設計: `命名サービス向けデータ構造設計.md`（v11）
- 設計: `docs/data-model.md`, `docs/screens.md`, `docs/api-design.md`, `docs/tasks.md`
